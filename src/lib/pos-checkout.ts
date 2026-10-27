import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationFinancialIntegrations, paymentCharges, retailSales } from "@/db/schema";
import { organizationAsaasRequest } from "./asaas";
import { getOrganizationAsaasCredential } from "./organization-asaas";
import { getPagBankCredential, pagBankRequest } from "./pagbank";
import { checkoutInputHash, checkoutUrlIsSafe, paymentCents, type MercadoPagoPayment } from "./pos-payments-policy";
import { posProviderReady } from "./pos-providers";
import { PosPaymentRepository } from "./pos-payment-repository";
import * as mp from "./pos-mercado-pago";
import { getEfiCredential } from "./efi";
import { efiPosSecret, ensureEfiPosCheckout, refreshEfiPosPayment, cancelEfiPosCheckout } from "./pos-efi";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "");
export async function getPosCharge(organizationId:string, saleId:string) {
  const [charge]=await db.select().from(paymentCharges).where(and(eq(paymentCharges.organizationId,organizationId),eq(paymentCharges.originId,saleId),eq(paymentCharges.originType,"retail_sale"))).limit(1);
  if(!charge) throw new Error("Cobrança integrada não encontrada.");
  return charge;
}
export async function posOtherContext(organizationId:string, provider:string) {
  const [integration]=await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId,organizationId),eq(organizationFinancialIntegrations.provider,provider))).limit(1);
  if(!integration || !posProviderReady(integration)) throw new Error("Conecte, valide e configure o webhook do provedor antes de usar o PDV.");
  const credential = provider === "asaas" ? await getOrganizationAsaasCredential(organizationId) : provider === "efi" ? await getEfiCredential(organizationId) : await getPagBankCredential(organizationId);
  const secret = "apiKey" in credential ? credential.apiKey : "token" in credential ? credential.token : efiPosSecret(credential);
  return { collectorId:"0", paymentEnvironment:credential.environment, credentialFingerprint:checkoutInputHash({provider,secret}) };
}
async function request<T>(charge:typeof paymentCharges.$inferSelect,path:string,method:"GET"|"POST"|"DELETE"="GET",body?:unknown) {
  const context=await posOtherContext(charge.organizationId,charge.provider);
  if(context.credentialFingerprint!==charge.metadata?.credentialFingerprint || context.paymentEnvironment!==charge.metadata?.environment) throw new Error("Restaure a conexão original para acompanhar esta venda.");
  if(charge.provider==="asaas") return organizationAsaasRequest<T>(path,await getOrganizationAsaasCredential(charge.organizationId),{method,body});
  if(charge.provider==="pagbank") return pagBankRequest<T>(path,await getPagBankCredential(charge.organizationId),{method,body,idempotencyKey:method==="POST"?`${charge.id}:${path}`:undefined});
  throw new Error("Provedor indisponível.");
}
export async function ensurePosCheckout(org:string,saleId:string) {
  const charge=await getPosCharge(org,saleId);
  if(charge.provider==="mercado_pago") return mp.ensurePosCheckout(org,saleId);
  if(charge.provider==="efi") return ensureEfiPosCheckout(charge);
  if(charge.invoiceUrl || charge.status!=="pending") return;
  await posOtherContext(org,charge.provider);
  const [sale]=await db.select().from(retailSales).where(and(eq(retailSales.id,saleId),eq(retailSales.organizationId,org))).limit(1);
  if(!sale || sale.status!=="pending_payment") return;
  const expiresAt=new Date(Date.now()+86400000).toISOString();
  const claimed=await db.transaction(async tx=>{
    const [current]=await tx.select().from(paymentCharges).where(eq(paymentCharges.id,charge.id)).for("update");
    if(current.metadata?.checkoutState!=="new") return false;
    await tx.update(paymentCharges).set({metadata:{...current.metadata,checkoutState:"creating",expiresAt},updatedAt:new Date()}).where(eq(paymentCharges.id,charge.id));
    return true;
  });
  if(!claimed) return;
  try {
    const returnUrl=`${appUrl()}/pagamento/venda/${sale.receiptToken}`;
    let checkoutId:string, url:string|undefined;
    if(charge.provider==="asaas") {
      const result=await request<{id:string}>(charge,"/checkouts","POST",{billingTypes:["PIX","CREDIT_CARD"],chargeTypes:["DETACHED"],minutesToExpire:1440,externalReference:`charge:${charge.id}`,callback:{successUrl:returnUrl,cancelUrl:returnUrl,expiredUrl:returnUrl},items:[{name:`Compra #${sale.id.slice(0,8)}`,quantity:1,value:sale.totalInCents/100}]});
      checkoutId=result.id;
      url=`https://${charge.metadata?.environment==="production"?"asaas.com":"sandbox.asaas.com"}/checkoutSession/show?id=${encodeURIComponent(checkoutId)}`;
    } else {
      const webhook=`${appUrl()}/api/webhooks/pagbank?organizationId=${org}`;
      const result=await request<{id:string;links?:{rel:string;href:string}[]}>(charge,"/checkouts","POST",{reference_id:`charge:${charge.id}`,expiration_date:expiresAt,customer_modifiable:true,items:[{reference_id:sale.id,name:`Compra #${sale.id.slice(0,8)}`,quantity:1,unit_amount:sale.totalInCents}],payment_methods:[{type:"PIX"},{type:"CREDIT_CARD"},{type:"BOLETO"}],payment_methods_configs:[{type:"CREDIT_CARD",config_options:[{option:"INSTALLMENTS_LIMIT",value:"1"}]}],redirect_url:returnUrl,return_url:returnUrl,notification_urls:[webhook],payment_notification_urls:[webhook]});
      checkoutId=result.id; url=result.links?.find(link=>link.rel==="PAY")?.href;
    }
    if(!checkoutId || !url || !checkoutUrlIsSafe(url,charge.provider)) throw new Error("Checkout inválido.");
    await db.transaction(async tx=>{
      const [current]=await tx.select().from(paymentCharges).where(eq(paymentCharges.id,charge.id)).for("update");
      await tx.update(paymentCharges).set({invoiceUrl:url,metadata:{...current.metadata,checkoutId,checkoutState:"ready"},updatedAt:new Date()}).where(eq(paymentCharges.id,charge.id));
    });
  } catch {
    await db.transaction(async tx=>{
      const [current]=await tx.select().from(paymentCharges).where(eq(paymentCharges.id,charge.id)).for("update");
      await tx.update(paymentCharges).set({metadata:{...current.metadata,checkoutState:"uncertain",checkoutError:"Não foi possível confirmar a criação do checkout. Consulte a situação e contate o suporte antes de gerar outra cobrança."},updatedAt:new Date()}).where(eq(paymentCharges.id,charge.id));
    });
  }
}
export type AsaasPosPayment={id:string;checkoutSession?:string;externalReference?:string;status:string;value:number;netValue?:number;billingType?:string;paymentDate?:string;confirmedDate?:string;refunds?:{value:number;status?:string}[]};
export type PagBankPosCharge={id:string;status:string;paid_at?:string;amount:{value:number;currency:string;summary?:{paid?:number;refunded?:number}};payment_method?:{type?:string}};
export type PagBankPosResource={id:string;reference_id?:string;status?:string;charges?:PagBankPosCharge[];payments?:{id:string;charges?:PagBankPosCharge[]}[]};
// Normalized transport only: the account/environment are bound by credential
// fingerprint before API access; native IDs, currency, amount and checkout are checked below.
function normalized(charge:typeof paymentCharges.$inferSelect,id:string,status:string,amount:number,refund:number,method?:string,date?:string):MercadoPagoPayment {
  return {id,status,external_reference:`charge:${charge.id}`,collector_id:0,live_mode:charge.metadata?.environment==="production",transaction_amount:amount/100,transaction_amount_refunded:refund/100,currency_id:"BRL",...(date?{date_approved:new Date(/^\d{4}-\d{2}-\d{2}$/.test(date)?`${date}T12:00:00Z`:date).toISOString()}:{}),payment_method_id:method==="PIX"?"pix":undefined,payment_type_id:method==="CREDIT_CARD"?"credit_card":method==="DEBIT_CARD"?"debit_card":method==="BOLETO"?"ticket":undefined};
}
export function normalizeAsaasPos(charge:typeof paymentCharges.$inferSelect,p:AsaasPosPayment) {
  if(!p.id || !charge.metadata?.checkoutId || p.checkoutSession!==charge.metadata.checkoutId || paymentCents(p.value)!==charge.amountInCents) throw new Error("Cobrança Asaas divergente da venda.");
  const refund=p.status==="REFUNDED"?charge.amountInCents:(p.refunds??[]).filter(r=>r.status==="DONE").reduce((sum,r)=>sum+(paymentCents(r.value)??NaN),0);
  if(!Number.isSafeInteger(refund) || refund<0 || refund>charge.amountInCents) throw new Error("Estorno inválido.");
  const status=p.status==="REFUNDED"?"refunded":["CHARGEBACK_REQUESTED","CHARGEBACK_DISPUTE","AWAITING_CHARGEBACK_REVERSAL","REFUND_REQUESTED","REFUND_IN_PROGRESS"].includes(p.status)?"in_mediation":["RECEIVED","CONFIRMED","RECEIVED_IN_CASH"].includes(p.status)?"approved":"pending";
  const payment=normalized(charge,p.id,status,charge.amountInCents,refund,p.billingType,p.confirmedDate??p.paymentDate);
  payment.transaction_details={net_received_amount:p.netValue};
  const net=paymentCents(p.netValue);
  if(net!==null && net<=charge.amountInCents) payment.fee_details=[{amount:(charge.amountInCents-net)/100}];
  return payment;
}
export function normalizePagBankPos(charge:typeof paymentCharges.$inferSelect,p:PagBankPosCharge) {
  if(!p.id || !p.amount || p.amount.currency!=="BRL" || p.amount.value!==charge.amountInCents) throw new Error("Cobrança PagBank divergente da venda.");
  const refunded=p.amount.summary?.refunded??0;
  if(!Number.isSafeInteger(refunded)||refunded<0||refunded>charge.amountInCents) throw new Error("Estorno inválido.");
  const status=refunded===charge.amountInCents?"refunded":p.status==="PAID"?(p.amount.summary?.paid===charge.amountInCents?"approved":"in_mediation"):["IN_DISPUTE","CHARGEBACK"].includes(p.status)?"in_mediation":"pending";
  return normalized(charge,p.id,status,charge.amountInCents,refunded,p.payment_method?.type,p.paid_at);
}
async function nativePayments(charge:typeof paymentCharges.$inferSelect) {
  const checkoutId=charge.metadata?.checkoutId;
  if(typeof checkoutId!=="string") throw new Error("Criação inconclusiva: contate o suporte para conferir o checkout.");
  if(charge.provider==="asaas") {
    const result=await request<{data:AsaasPosPayment[];hasMore?:boolean}>(charge,`/payments?checkoutSession=${encodeURIComponent(checkoutId)}&limit=100`);
    if(!Array.isArray(result.data)||result.hasMore) throw new Error("Cobrança exige conferência adicional.");
    return result.data.map(payment=>({raw:payment,payment:normalizeAsaasPos(charge,payment)}));
  }
  const resource=await request<PagBankPosResource>(charge,`/checkouts/${encodeURIComponent(checkoutId)}?limit=100`);
  if(resource.id!==checkoutId || resource.reference_id!==`charge:${charge.id}` || (resource.payments?.length??0)>=100) throw new Error("Checkout PagBank divergente ou incompleto.");
  return [...(resource.charges??[]),...(resource.payments??[]).flatMap(p=>p.charges??[])].filter((p,index,all)=>all.findIndex(other=>other.id===p.id)===index).map(payment=>({raw:payment,payment:normalizePagBankPos(charge,payment)}));
}
export async function refreshPosPayment(org:string,saleId:string) {
  const charge=await getPosCharge(org,saleId);
  if(charge.provider==="mercado_pago") return mp.refreshPosPayment(org,saleId);
  if(charge.provider==="efi") return refreshEfiPosPayment(charge);
  const repository=new PosPaymentRepository(db);
  for(const {payment} of await nativePayments(charge)) await repository.apply(org,charge.id,payment,charge.provider);
}
export async function cancelPosCheckout(org:string,saleId:string,user:string) {
  const charge=await getPosCharge(org,saleId);
  if(charge.provider==="mercado_pago") return mp.cancelPosCheckout(org,saleId,user);
  if(charge.provider==="efi") return cancelEfiPosCheckout(charge,user);
  if(charge.status!=="pending") throw new Error("Confira o pagamento; este checkout não está pendente.");
  const id=charge.metadata?.checkoutId;
  if(typeof id!=="string") throw new Error("A criação do checkout está inconclusiva. A reserva foi mantida; contate o suporte.");
  await request(charge,charge.provider==="asaas"?`/checkouts/${encodeURIComponent(id)}/cancel`:`/checkouts/${encodeURIComponent(id)}/inactivate`,"POST");
  const repository=new PosPaymentRepository(db);
  for(let pass=0;pass<2;pass++) for(const {raw,payment} of await nativePayments(charge)) {
    if(payment.status!=="pending") { await repository.apply(org,charge.id,payment,charge.provider); throw new Error("O provedor já processou um pagamento. Confira a situação antes de cancelar."); }
    if(charge.provider==="asaas") {
      const p=raw as AsaasPosPayment;
      if(!["PENDING","OVERDUE","DELETED"].includes(p.status)) throw new Error("O provedor ainda não confirmou o cancelamento. A reserva foi mantida.");
      if(p.status!=="DELETED") {const result=await request<{deleted:boolean}>(charge,`/payments/${encodeURIComponent(p.id)}`,"DELETE");if(!result.deleted) throw new Error("Cancelamento não confirmado.");}
    } else if(!["DECLINED","CANCELED","CANCELLED"].includes(raw.status)) throw new Error("O provedor ainda não confirmou o cancelamento. A reserva foi mantida.");
  }
  await repository.cancelUnpaid(org,saleId,user,charge.provider);
}
