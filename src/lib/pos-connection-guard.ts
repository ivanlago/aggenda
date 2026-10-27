import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges } from "@/db/schema";
import { checkoutInputHash } from "./pos-payments-policy";

export async function posConnectionGuard(org:string,provider:string,next?:{secret:string;environment:string}) {
  const charges=await db.select({metadata:paymentCharges.metadata}).from(paymentCharges).where(and(eq(paymentCharges.organizationId,org),eq(paymentCharges.provider,provider),eq(paymentCharges.originType,"retail_sale"),inArray(paymentCharges.status,["pending","paid","payment_review","partially_refunded"])));
  if(charges.some(charge=>!next || charge.metadata?.credentialFingerprint!==checkoutInputHash({provider,secret:next.secret}) || charge.metadata?.environment!==next.environment)) return "Há vendas do PDV vinculadas à conexão original. Mantenha as credenciais e o ambiente para acompanhar pagamentos e estornos; contate o suporte para migrar a conexão.";
  return null;
}
