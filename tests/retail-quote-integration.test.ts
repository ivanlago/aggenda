import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { normalizeDatabaseUrl } from "../src/lib/database-url";

// RUN_DATABASE_TESTS=1: exercises the actual actions in nested transactions.
// Every fixture and action write is rolled back, including successful sales.
test("salva, recupera e converte orçamentos sem efeitos financeiros antes da venda", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  loadEnvConfig(process.cwd());
  const pool = new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL!) });
  const database = drizzle(pool, { schema });
  const bundlePath = path.resolve("tmp", `quote-actions-${randomUUID()}.cjs`);
  const rollback = new Error("ROLLBACK_QUOTE_TEST");
  const scope = globalThis as typeof globalThis & { quoteTestDb?: unknown; quoteTestContext?: unknown };
  try {
    await mkdir(path.dirname(bundlePath), { recursive: true });
    await build({
      stdin: { contents: 'export { saveRetailQuote } from "./src/actions/retail-quotes"; export { registerRetailSale } from "./src/actions/retail";', resolveDir: process.cwd(), loader: "ts" },
      bundle: true, platform: "node", format: "cjs", packages: "external", outfile: bundlePath,
      plugins: [{ name: "test-boundaries", setup(builder) {
        const mocks: Record<string, string> = {
          "@/db": "export const db = globalThis.quoteTestDb;",
          "@/lib/session": "export async function requireOrganization(){return globalThis.quoteTestContext;} export async function requireProfessionalScope(){throw new Error('Unexpected professional scope');}",
          "@/lib/attendance": "export async function requireAttendance(){throw new Error('Unexpected attendance');}",
          "next/cache": "export function revalidatePath(){}",
          "@/lib/audit": "export async function writeAuditLog(){}",
          "@/lib/email": "export async function sendRetailReceiptEmail(){throw new Error('Unexpected email');}",
          "@/lib/outbox-trigger": "export async function triggerOutboxWorker(){throw new Error('Unexpected outbox');}",
          "@/lib/catalog-image": "export async function persistWithCatalogImage(){throw new Error('Unexpected image');}",
          "@/lib/cloudinary": "export async function deleteCatalogImage(){throw new Error('Unexpected image');}",
        };
        builder.onResolve({ filter: /./ }, (args) => mocks[args.path] ? { path: args.path, namespace: "test-boundary" } : undefined);
        builder.onLoad({ filter: /./, namespace: "test-boundary" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
      } }],
    });
    await assert.rejects(database.transaction(async (tx) => {
      const userId = randomUUID();
      await tx.insert(schema.users).values({ id: userId, name: "Teste descartável", email: `${userId}@example.invalid` });
      const [org] = await tx.insert(schema.organizations).values({ name: "Teste descartável", slug: `quote-test-${randomUUID()}` }).returning();
      const [client] = await tx.insert(schema.clients).values({ organizationId: org.id, name: "Cliente de teste" }).returning();
      const [service] = await tx.insert(schema.services).values({ organizationId: org.id, name: "Procedimento de teste", durationMinutes: 30, priceInCents: 2000 }).returning();
      const [product] = await tx.insert(schema.retailProducts).values({ organizationId: org.id, name: "Produto de teste" }).returning();
      const [inventory] = await tx.insert(schema.inventoryProducts).values({ organizationId: org.id, name: "Estoque de teste", currentQuantityMillis: 10000 }).returning();
      const [variant] = await tx.insert(schema.retailProductVariants).values({ organizationId: org.id, productId: product.id, inventoryProductId: inventory.id, salePriceInCents: 1000 }).returning();
      const [pack] = await tx.insert(schema.servicePackages).values({ organizationId: org.id, name: "Pacote de teste", priceInCents: 5000 }).returning();
      await tx.insert(schema.servicePackageItems).values({ organizationId: org.id, packageId: pack.id, serviceId: service.id, quantity: 6 });
      scope.quoteTestDb = tx;
      const context = { organization: { ...org, role: "owner" }, session: { user: { id: userId } } };
      scope.quoteTestContext = context;
      const actions = createRequire(import.meta.url)(bundlePath) as {
        saveRetailQuote: (data: FormData) => Promise<{ error?: string; openUrl?: string }>;
        registerRetailSale: (data: FormData) => Promise<{ error?: string; openUrl?: string }>;
      };
      const items = [{ variantId: variant.id, quantity: 2, discountInCents: 100 }, { variantId: `service:${service.id}`, quantity: 1, discountInCents: 0 }, { variantId: `package:${pack.id}`, quantity: 1, discountInCents: 0 }];
      const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
      const anonymousId = randomUUID();
      const identifiedId = randomUUID();
      const base = { validUntil: "2099-12-31", notes: "Teste descartável", items: JSON.stringify(items) };
      assert.equal((await actions.saveRetailQuote(form({ ...base, id: anonymousId }))).openUrl, `/api/quotes/${anonymousId}/pdf`);
      assert.equal((await tx.select().from(schema.clientHistoryEntries).where(eq(schema.clientHistoryEntries.organizationId, org.id))).length, 0);
      await actions.saveRetailQuote(form({ ...base, id: identifiedId, clientId: client.id }));
      await actions.saveRetailQuote(form({ ...base, id: identifiedId, clientId: client.id }));
      assert.equal((await tx.select().from(schema.retailQuotes).where(eq(schema.retailQuotes.organizationId, org.id))).length, 2, "reenvio não duplica orçamento");
      assert.equal((await tx.select().from(schema.clientHistoryEntries).where(eq(schema.clientHistoryEntries.organizationId, org.id))).length, 1);
      assert.equal((await tx.select().from(schema.financialEntries).where(eq(schema.financialEntries.organizationId, org.id))).length, 0);
      assert.equal((await tx.select().from(schema.clientPackages).where(eq(schema.clientPackages.organizationId, org.id))).length, 0);
      assert.equal((await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, inventory.id)))[0].currentQuantityMillis, 10000);
      await tx.update(schema.retailProductVariants).set({ salePriceInCents: 99000 }).where(eq(schema.retailProductVariants.id, variant.id));
      await tx.update(schema.services).set({ priceInCents: 99000 }).where(eq(schema.services.id, service.id));
      await tx.update(schema.servicePackages).set({ priceInCents: 99000 }).where(eq(schema.servicePackages.id, pack.id));
      const payment = { quoteId: identifiedId, clientId: client.id, items: JSON.stringify(items), payments: JSON.stringify([{ method: "cash", amountInCents: 8900 }]), received: "on" };
      await assert.rejects(actions.registerRetailSale(form({ ...payment, items: JSON.stringify(items.slice(1)) })), /corresponder/);
      await tx.update(schema.inventoryProducts).set({ currentQuantityMillis: 0 }).where(eq(schema.inventoryProducts.id, inventory.id));
      await assert.rejects(actions.registerRetailSale(form(payment)), /Estoque insuficiente/);
      assert.equal((await tx.select().from(schema.retailQuotes).where(eq(schema.retailQuotes.id, identifiedId)))[0].saleId, null);
      await tx.update(schema.inventoryProducts).set({ currentQuantityMillis: 10000 }).where(eq(schema.inventoryProducts.id, inventory.id));
      const converted = await actions.registerRetailSale(form(payment));
      assert.match(converted.openUrl ?? "", /^\/recibo\//);
      const [saved] = await tx.select().from(schema.retailQuotes).where(eq(schema.retailQuotes.id, identifiedId));
      assert.ok(saved.saleId);
      const [sale] = await tx.select().from(schema.retailSales).where(eq(schema.retailSales.id, saved.saleId!));
      assert.equal(sale.totalInCents, 8900, "preserva o preço cotado mesmo após mudar o catálogo");
      assert.equal((await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, inventory.id)))[0].currentQuantityMillis, 8000);
      assert.equal((await tx.select().from(schema.clientPackages).where(eq(schema.clientPackages.organizationId, org.id))).length, 1);
      assert.match((await actions.registerRetailSale(form(payment))).error ?? "", /já foi convertido/);
      assert.equal((await tx.select().from(schema.retailSales).where(eq(schema.retailSales.organizationId, org.id))).length, 1);
      const anonymousProductId = randomUUID();
      const productItems = JSON.stringify([{ variantId: variant.id, quantity: 1, discountInCents: 0 }]);
      await actions.saveRetailQuote(form({ ...base, id: anonymousProductId, items: productItems }));
      assert.match((await actions.registerRetailSale(form({ ...payment, quoteId: anonymousProductId, clientId: "", items: productItems, payments: JSON.stringify([{ method: "cash", amountInCents: 99000 }]) }))).openUrl ?? "", /^\/recibo\//);
      const [anonymousQuote] = await tx.select().from(schema.retailQuotes).where(eq(schema.retailQuotes.id, anonymousProductId));
      assert.equal((await tx.select().from(schema.retailSales).where(eq(schema.retailSales.id, anonymousQuote.saleId!)))[0].clientId, null);
      // A full discount may finish with one zero payment, never with a stray zero installment.
      const freeItems = JSON.stringify([{ variantId: variant.id, quantity: 1, discountInCents: 99000 }]);
      await assert.rejects(actions.registerRetailSale(form({ items: productItems, payments: JSON.stringify([{ method: "cash", amountInCents: 99000 }, { method: "pix", amountInCents: 0 }]) })), /Pagamento zero/);
      const freeSale = await actions.registerRetailSale(form({ items: freeItems, payments: JSON.stringify([{ method: "cash", amountInCents: 0 }]) }));
      assert.match(freeSale.openUrl ?? "", /^\/recibo\//);
      const freeSales = await tx.select().from(schema.retailSales).where(eq(schema.retailSales.organizationId, org.id));
      assert.ok(freeSales.some((entry) => entry.totalInCents === 0 && entry.discountInCents === 99000));
      await tx.update(schema.retailQuotes).set({ validUntil: "2000-01-01" }).where(eq(schema.retailQuotes.id, anonymousId));
      assert.match((await actions.registerRetailSale(form({ ...payment, quoteId: anonymousId }))).error ?? "", /vencido/);
      scope.quoteTestContext = { ...context, organization: { ...context.organization, id: randomUUID() } };
      assert.match((await actions.registerRetailSale(form(payment))).error ?? "", /não encontrado/);
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    delete scope.quoteTestDb;
    delete scope.quoteTestContext;
    await pool.end();
    await rm(bundlePath, { force: true });
  }
});
