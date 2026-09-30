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
import { sumProcedureMaterials } from "../src/lib/attendance-materials";

test("sums materials shared by primary and multiple package procedures", () => {
  assert.deepEqual(sumProcedureMaterials([{ serviceId: "a", productId: "p", quantity: 1000 }, { serviceId: "b", productId: "p", quantity: 500 }], [{ serviceId: "a", quantity: 1 }, { serviceId: "b", quantity: 3 }]), [{ productId: "p", quantity: 2500 }]);
});

test("package selection, stock consumption and status reversal stay consistent", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  loadEnvConfig(process.cwd());
  const pool = new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL!) });
  const database = drizzle(pool, { schema });
  const file = path.resolve("tmp", `attendance-package-test-${randomUUID()}.cjs`);
  const rollback = new Error("ROLLBACK_TEST");
  const scope = globalThis as typeof globalThis & { packageTestDb?: unknown; packageTestContext?: unknown; packageTestAppointment?: unknown };
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await build({
      stdin: { contents: 'export { removeAttendancePrimaryProcedure } from "./src/actions/attendance-primary-procedure"; export { reservePackageSession } from "./src/lib/package-balance"; export { addAttendancePackageItem, removeAttendancePackageItem } from "./src/actions/attendance-package-items"; export { updateAppointmentAndInventory } from "./src/lib/inventory"; export { getPosPackageBalances } from "./src/lib/pos-package-balances";', resolveDir: process.cwd(), loader: "ts" },
      bundle: true, platform: "node", format: "cjs", packages: "external", outfile: file,
      plugins: [{ name: "test-boundaries", setup(builder) {
        const mocks: Record<string, string> = {
          "@/db": "export const db = globalThis.packageTestDb;",
          "@/lib/attendance": "export async function requireAttendance(id){ if(id!==globalThis.packageTestAppointment.id) throw new Error('Invalid attendance'); return {...globalThis.packageTestContext, appointment:globalThis.packageTestAppointment}; }",
          "next/cache": "export function revalidatePath(){}",
          "@/lib/audit": "export async function writeAuditLog(){}",
        };
        builder.onResolve({ filter: /./ }, (args) => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /./, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
      } }],
    });
    await assert.rejects(database.transaction(async (tx) => {
      const userId = randomUUID();
      await tx.insert(schema.users).values({ id: userId, name: "Teste", email: `${userId}@example.invalid` });
      const [org] = await tx.insert(schema.organizations).values({ name: "Teste", slug: `package-test-${randomUUID()}` }).returning();
      const [client] = await tx.insert(schema.clients).values({ organizationId: org.id, name: "Teste" }).returning();
      const [otherClient] = await tx.insert(schema.clients).values({ organizationId: org.id, name: "Outro" }).returning();
      const [primary, extra] = await tx.insert(schema.services).values(["Principal", "Adicional"].map((name) => ({ organizationId: org.id, name, durationMinutes: 30, priceInCents: 1000 }))).returning();
      const [appointment] = await tx.insert(schema.appointments).values({ organizationId: org.id, clientId: client.id, serviceId: primary.id, startsAt: new Date(), endsAt: new Date(Date.now() + 1800000), status: "scheduled" }).returning();
      const [pack] = await tx.insert(schema.servicePackages).values({ organizationId: org.id, name: "Pacote", priceInCents: 5000 }).returning();
      const [assigned] = await tx.insert(schema.clientPackages).values({ organizationId: org.id, clientId: client.id, packageId: pack.id, priceInCents: 5000 }).returning();
      const [balance] = await tx.insert(schema.clientPackageBalances).values({ organizationId: org.id, clientPackageId: assigned.id, serviceId: extra.id, totalQuantity: 5 }).returning();
      const [stock] = await tx.insert(schema.inventoryProducts).values({ organizationId: org.id, name: "Material", currentQuantityMillis: 10000 }).returning();
      await tx.insert(schema.serviceInventoryItems).values([{ organizationId: org.id, serviceId: primary.id, productId: stock.id, quantityMillis: 1000 }, { organizationId: org.id, serviceId: extra.id, productId: stock.id, quantityMillis: 500 }]);
      scope.packageTestDb = tx;
      scope.packageTestContext = { organization: { ...org, role: "professional" }, session: { user: { id: userId } } };
      scope.packageTestAppointment = appointment;
      const api = createRequire(import.meta.url)(file) as {
        removeAttendancePrimaryProcedure: typeof import("../src/actions/attendance-primary-procedure").removeAttendancePrimaryProcedure;
        reservePackageSession: typeof import("../src/lib/package-balance").reservePackageSession;
        addAttendancePackageItem: typeof import("../src/actions/attendance-package-items").addAttendancePackageItem;
        removeAttendancePackageItem: typeof import("../src/actions/attendance-package-items").removeAttendancePackageItem;
        updateAppointmentAndInventory: typeof import("../src/lib/inventory").updateAppointmentAndInventory;
        getPosPackageBalances: typeof import("../src/lib/pos-package-balances").getPosPackageBalances;
      };
      const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ appointmentId: appointment.id, balanceId: balance.id, quantity: "2", ...values })) data.set(key, value); return data; };
      assert.ok((await api.addAttendancePackageItem(form({ quantity: "6" })))?.error);
      await tx.update(schema.clientPackages).set({ clientId: otherClient.id }).where(eq(schema.clientPackages.id, assigned.id));
      assert.ok((await api.addAttendancePackageItem(form({})))?.error);
      await tx.update(schema.clientPackages).set({ clientId: client.id, expiresAt: new Date(0) }).where(eq(schema.clientPackages.id, assigned.id));
      assert.ok((await api.addAttendancePackageItem(form({})))?.error);
      await tx.update(schema.clientPackages).set({ expiresAt: null }).where(eq(schema.clientPackages.id, assigned.id));
      assert.equal(await api.addAttendancePackageItem(form({})), undefined);
      assert.ok((await api.addAttendancePackageItem(form({})))?.error, "duplicate submission must not consume more sessions");
      let balances = await api.getPosPackageBalances(org.id, client.id);
      assert.equal(balances[0].remaining, 3);
      assert.equal(balances[0].reserved, 2);
      const [item] = await tx.select().from(schema.attendancePackageItems).where(eq(schema.attendancePackageItems.appointmentId, appointment.id));
      await api.removeAttendancePackageItem(form({ itemId: item.id }));
      assert.equal((await api.getPosPackageBalances(org.id, client.id))[0].remaining, 5);
      await api.addAttendancePackageItem(form({}));
      const update = (status: "completed" | "cancelled" | "confirmed") => api.updateAppointmentAndInventory({ appointmentId: appointment.id, organizationId: org.id, userId, status, cancellationReason: null });
      await assert.rejects(update("completed"), /procedimento principal/);
      assert.equal((await tx.select().from(schema.appointments).where(eq(schema.appointments.id, appointment.id)))[0].status, "scheduled");
      assert.equal((await api.getPosPackageBalances(org.id, client.id))[0].reserved, 2);
      assert.equal((await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, stock.id)))[0].currentQuantityMillis, 10000);
      await tx.update(schema.appointments).set({ priceInCents: 0, metadata: { pendingAttendanceItems: [{ id: randomUUID(), catalogId: `service:${extra.id}`, label: "Adicional", quantity: 1 }] } }).where(eq(schema.appointments.id, appointment.id));
      await assert.rejects(update("completed"), /pendentes de pagamento/);
      await tx.update(schema.appointments).set({ metadata: {} }).where(eq(schema.appointments.id, appointment.id));
      await update("completed");
      await update("completed");
      balances = await api.getPosPackageBalances(org.id, client.id);
      assert.equal(balances[0].remaining, 3);
      assert.equal(balances[0].reserved, 0);
      assert.equal((await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, stock.id)))[0].currentQuantityMillis, 8000);
      assert.ok((await api.addAttendancePackageItem(form({})))?.error);
      await update("cancelled");
      assert.equal((await api.getPosPackageBalances(org.id, client.id))[0].remaining, 5);
      assert.equal((await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, stock.id)))[0].currentQuantityMillis, 10000);
      await update("confirmed");
      assert.equal((await api.getPosPackageBalances(org.id, client.id))[0].reserved, 2);
      await update("completed");
      assert.equal((await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, stock.id)))[0].currentQuantityMillis, 8000);
      await update("confirmed");
      const [mainBalance] = await tx.insert(schema.clientPackageBalances).values({ organizationId: org.id, clientPackageId: assigned.id, serviceId: primary.id, totalQuantity: 3 }).returning();
      await api.reservePackageSession({ appointmentId: appointment.id, organizationId: org.id, clientId: client.id, serviceId: primary.id, clientPackageId: assigned.id });
      assert.equal(await api.removeAttendancePrimaryProcedure(form({})), undefined);
      assert.equal((await tx.select().from(schema.clientPackageBalances).where(eq(schema.clientPackageBalances.id, mainBalance.id)))[0].usedQuantity, 0);
      assert.equal((await tx.select().from(schema.packageUsages).where(eq(schema.packageUsages.appointmentId, appointment.id))).length, 0);
      await update("completed");
      assert.equal((await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, stock.id)))[0].currentQuantityMillis, 9000, "removed primary must not consume materials again");
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    delete scope.packageTestDb; delete scope.packageTestContext; delete scope.packageTestAppointment;
    await pool.end();
    await rm(file, { force: true });
  }
});
