"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { paymentCharges, retailSales } from "@/db/schema";
import { ensurePosCheckout } from "@/lib/pos-mercado-pago";

/** Receipt tokens authorize access only to their own scheduled boleto links.
 * Amount, provider, customer, and dates always come from the persisted sale. */
export async function issueSaleBoleto(data: FormData) {
  const token = String(data.get("token") ?? ""), chargeId = String(data.get("chargeId") ?? "");
  if (![token,chargeId].every(value => /^[a-f0-9-]{36}$/i.test(value))) return {error:"Parcela inválida."};
  const [row] = await db.select({charge:paymentCharges,sale:retailSales}).from(retailSales).innerJoin(paymentCharges,and(
    eq(paymentCharges.originId,sql`${retailSales.id}::text`),eq(paymentCharges.organizationId,retailSales.organizationId)))
    .where(and(eq(retailSales.receiptToken,token),eq(paymentCharges.id,chargeId),eq(paymentCharges.originType,"retail_sale"))).limit(1);
  if (!row || row.charge.provider !== "mercado_pago" || row.charge.metadata?.saleOnCredit !== true || row.charge.metadata?.catalogPaymentKind !== "boleto" || row.sale.status !== "completed") return {error:"Parcela indisponível."};
  try { await ensurePosCheckout(row.sale.organizationId,row.sale.id,chargeId); }
  catch { return {error:"Não foi possível gerar o boleto agora. Entre em contato com o estabelecimento."}; }
  revalidatePath(`/pagamento/venda/${token}`);
  revalidatePath(`/vendas/pagamento/${row.sale.id}`);
  revalidatePath("/financeiro/lancamentos");
}
