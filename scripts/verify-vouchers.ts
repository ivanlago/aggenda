import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";

loadEnvConfig(process.cwd());
async function main() {
  const { db } = await import("../src/db");
  const { appointments, clients, organizations, services, users, voucherDeliveries, voucherRedemptions, vouchers } = await import("../src/db/schema");
  const { reserveBookingVoucher } = await import("../src/lib/voucher-booking");
  const { processVoucherDeliveries } = await import("../src/lib/voucher-delivery");
  const rollback = new Error("TEST_ROLLBACK");
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests++;
    const payload = JSON.parse(String(init?.body));
    assert.ok(payload.html.includes("Maria &lt;teste&gt;"));
    assert.ok(!payload.html.includes("<script>"));
    return new Response(JSON.stringify({ id: "email-simulado" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await db.transaction(async (tx) => {
      const slug = `voucher-test-${crypto.randomUUID()}`;
      const [organization] = await tx.insert(organizations).values({ name: "Voucher Test", slug, timezone: "America/Bahia" }).returning();
      const [other] = await tx.insert(organizations).values({ name: "Other Tenant", slug: `${slug}-other` }).returning();
      const [client] = await tx.insert(clients).values({ organizationId: organization.id, name: "Maria <teste>", email: "voucher@example.invalid" }).returning();
      const [second] = await tx.insert(clients).values({ organizationId: organization.id, name: "Outro cliente" }).returning();
      const [user] = await tx.insert(users).values({ id: crypto.randomUUID(), name: "Voucher Test", email: `${slug}@example.invalid` }).returning();
      const [service] = await tx.insert(services).values({ organizationId: organization.id, name: "Limpeza", durationMinutes: 30, priceInCents: 20000 }).returning();
      const [voucher] = await tx.insert(vouchers).values({ organizationId: organization.id, code: "VOLTE10", discountType: "percentage", discountValue: 10, maxUses: 1, clientId: client.id }).returning();
      await assert.rejects(reserveBookingVoucher(tx, other.id, client.id, "VOLTE10", 20000), /VOUCHER_INVALID/);
      await assert.rejects(reserveBookingVoucher(tx, organization.id, second.id, "VOLTE10", 20000), /VOUCHER_INVALID/);
      const quote = await reserveBookingVoucher(tx, organization.id, client.id, "VOLTE10", 20000);
      assert.equal(quote.finalPriceInCents, 18000);
      const [appointment] = await tx.insert(appointments).values({ organizationId: organization.id, clientId: client.id, serviceId: service.id, startsAt: new Date("2026-10-20T12:00:00Z"), endsAt: new Date("2026-10-20T12:30:00Z"), priceInCents: quote.finalPriceInCents }).returning();
      await tx.insert(voucherRedemptions).values({ organizationId: organization.id, clientId: client.id, voucherId: voucher.id, appointmentId: appointment.id, discountInCents: quote.discountInCents });
      await tx.update(vouchers).set({ usedCount: 1 }).where(eq(vouchers.id, voucher.id));
      await assert.rejects(reserveBookingVoucher(tx, organization.id, client.id, "VOLTE10", 20000), /VOUCHER_INVALID/);
      assert.equal((await tx.select().from(voucherRedemptions).where(eq(voucherRedemptions.voucherId, voucher.id)))[0].discountInCents, 2000);
      await tx.update(vouchers).set({ usedCount: 0 }).where(eq(vouchers.id, voucher.id));
      const row = { organizationId: organization.id, clientId: client.id, voucherId: voucher.id, batchId: crypto.randomUUID(), campaignName: "Teste", channel: "email", recipient: "voucher@example.invalid", message: "Olá, Maria <teste>! VOLTE10", bookingUrl: "https://example.invalid/cliente/test?novo=1&voucher=VOLTE10", createdByUserId: user.id };
      const [delivery] = await tx.insert(voucherDeliveries).values(row).returning();
      assert.equal((await tx.insert(voucherDeliveries).values({ ...row, batchId: crypto.randomUUID() }).onConflictDoNothing().returning()).length, 0);
      const database = tx as unknown as typeof db;
      assert.deepEqual(await processVoucherDeliveries(other.id, 1, database), { sent: 0, failed: 0 });
      assert.deepEqual(await processVoucherDeliveries(organization.id, 1, database), { sent: 1, failed: 0 });
      assert.equal(requests, 1);
      assert.equal((await tx.select().from(voucherDeliveries).where(eq(voucherDeliveries.id, delivery.id)))[0].providerMessageId, "email-simulado");
      await processVoucherDeliveries(organization.id, 1, database); assert.equal(requests, 1);
      await tx.update(voucherDeliveries).set({ status: "pending" }).where(eq(voucherDeliveries.id, delivery.id));
      await tx.update(vouchers).set({ isActive: false }).where(eq(vouchers.id, voucher.id));
      await processVoucherDeliveries(organization.id, 1, database);
      assert.equal((await tx.select().from(voucherDeliveries).where(and(eq(voucherDeliveries.id, delivery.id), eq(voucherDeliveries.organizationId, organization.id))))[0].status, "cancelled");
      assert.equal(requests, 1);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { globalThis.fetch = originalFetch; }
  console.log("Vouchers: exclusividade, isolamento, desconto, esgotamento, histórico, deduplicação, envio simulado e cancelamento validados. Rollback concluído; nenhuma mensagem real enviada.");
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
