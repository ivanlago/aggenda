import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { financialEntries, paymentCharges } from "@/db/schema";
import { ProviderRequestError } from "./provider-request-error";
import { managedChargeStatuses } from "./finance-view";

type Charge = typeof paymentCharges.$inferInsert;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function reserveFinancialCharge(charge: Charge & { id: string; financialEntryId: string }, payment: {
  accountId: string; paymentMethodId: string; paymentMethodName: string; method: string;
}) {
  return db.transaction(async tx => {
    const [entry] = await tx.select({ id: financialEntries.id }).from(financialEntries).where(and(
      eq(financialEntries.id, charge.financialEntryId), eq(financialEntries.organizationId, charge.organizationId),
      eq(financialEntries.type, "receivable"), eq(financialEntries.status, "pending"),
    )).for("update");
    if (!entry) return { error: "Selecione uma conta a receber pendente." };
    const [active] = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(and(
      eq(paymentCharges.organizationId, charge.organizationId), eq(paymentCharges.financialEntryId, entry.id),
      inArray(paymentCharges.status, managedChargeStatuses),
    )).limit(1);
    if (active) return { error: "Este lançamento já possui uma cobrança vinculada. Consulte Cobranças online.", chargeId: active.id };
    await tx.update(financialEntries).set({
      accountId: payment.accountId, paymentMethodId: payment.paymentMethodId, paymentMethodName: payment.paymentMethodName,
      paymentMethod: payment.method, updatedAt: new Date(),
    }).where(eq(financialEntries.id, entry.id));
    await tx.insert(paymentCharges).values({ ...charge, status: "payment_review", metadata: { issuanceState: "creating" } });
    return null;
  });
}

export async function failFinancialCharge(id: string, error: unknown, canConfirmRejection = true) {
  const rejected = canConfirmRejection && error instanceof ProviderRequestError && [400, 401, 403, 404, 422].includes(error.status);
  const [row] = await db.update(paymentCharges).set({
    status: rejected ? "issuance_failed" : "payment_review",
    metadata: { issuanceState: rejected ? "rejected" : "uncertain" },
    updatedAt: new Date(),
  }).where(and(eq(paymentCharges.id, id), eq(paymentCharges.status, "payment_review"), sql`${paymentCharges.metadata}->>'issuanceState' = 'creating'`)).returning({ id: paymentCharges.id });
  if (rejected && row) return { error: "O provedor recusou a emissão. Confira os dados da cobrança e tente novamente." };
  return { error: "Emissão em conferência. Verifique no provedor antes de gerar outra cobrança.", chargeId: id };
}

export function finishFinancialCharge(tx: Transaction, id: string, details: Partial<Charge>) {
  return tx.update(paymentCharges).set({
    ...details,
    providerPaymentId: details.providerPaymentId ? sql`coalesce(${paymentCharges.providerPaymentId}, ${details.providerPaymentId})` : undefined,
    status: sql`case when ${paymentCharges.status} = 'payment_review' and ${paymentCharges.providerPaymentId} is null then 'pending' else ${paymentCharges.status} end`,
    updatedAt: new Date(),
  }).where(eq(paymentCharges.id, id));
}
