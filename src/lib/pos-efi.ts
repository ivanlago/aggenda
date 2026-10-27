import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, retailSales } from "@/db/schema";
import { efiRequest, getEfiCredential, type EfiCredential } from "./efi";
import { checkoutInputHash, paymentCents, type MercadoPagoPayment } from "./pos-payments-policy";
import { PosPaymentRepository } from "./pos-payment-repository";

type Charge=typeof paymentCharges.$inferSelect;
export type EfiPosCob={txid:string;status:string;chave?:string;valor:{original:string};loc?:{id?:number};pixCopiaECola?:string;pix?:{endToEndId:string;horario:string;valor:string;devolucoes?:{valor:string;status:string}[]}[]};
export function efiPosSecret(c: Pick<EfiCredential,"clientId"|"clientSecret"|"pixKey"|"certificateBase64">) {
  return JSON.stringify({clientId:c.clientId,clientSecret:c.clientSecret,pixKey:c.pixKey,certificateBase64:c.certificateBase64});
}
async function credential(charge:Charge) {
  const c=await getEfiCredential(charge.organizationId);
  if(charge.provider!=="efi" || c.environment!==charge.metadata?.environment || checkoutInputHash({provider:"efi",secret:efiPosSecret(c)})!==charge.metadata?.credentialFingerprint) throw new Error("Restaure a conexão Efí original para acompanhar esta venda.");
  return c;
}
const txidFor=(charge:Charge)=>charge.id.replaceAll("-","");
const cents=(value:string)=>/^\d+\.\d{2}$/.test(value)?paymentCents(Number(value)):null;
export function normalizeEfiPos(charge:Charge,cob:EfiPosCob,pixKey:string):MercadoPagoPayment|null {
  if(cob.txid!==txidFor(charge) || cob.chave!==pixKey || cents(cob.valor?.original)!==charge.amountInCents) throw new Error("Cobrança Pix divergente da venda.");
  if(!cob.pix?.length) return null;
  const paid=cob.pix.reduce((sum,pix)=>sum+(cents(pix.valor)??NaN),0);
  const refund=cob.pix.flatMap(pix=>pix.devolucoes??[]).filter(item=>item.status==="DEVOLVIDO").reduce((sum,item)=>sum+(cents(item.valor)??NaN),0);
  if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(refund)||refund<0||refund>charge.amountInCents) throw new Error("Valores Pix inválidos.");
  const status=paid!==charge.amountInCents || cob.pix.length!==1 || cob.status!=="CONCLUIDA" ? "in_mediation" : refund===charge.amountInCents ? "refunded" : "approved";
  return {id:txidFor(charge),status,external_reference:`charge:${charge.id}`,collector_id:0,live_mode:charge.metadata?.environment==="production",currency_id:"BRL",transaction_amount:charge.amountInCents/100,transaction_amount_refunded:refund/100,payment_method_id:"pix",date_approved:cob.pix[0].horario};
}
async function saveQr(charge:Charge,cob:EfiPosCob,c:EfiCredential) {
  let payload=cob.pixCopiaECola;
  if(!payload && cob.loc?.id){const qr=await efiRequest<{qrcode?:string}>(`/v2/loc/${cob.loc.id}/qrcode`,c);payload=qr.qrcode;}
  if(!payload || !payload.startsWith("000201") || payload.length>4096) throw new Error("Código Pix indisponível.");
  await db.transaction(async tx=>{
    const [current]=await tx.select().from(paymentCharges).where(eq(paymentCharges.id,charge.id)).for("update");
    await tx.update(paymentCharges).set({pixQrCodePayload:payload,metadata:{...current.metadata,checkoutState:"ready",checkoutError:null},updatedAt:new Date()}).where(eq(paymentCharges.id,charge.id));
  });
}
export async function ensureEfiPosCheckout(charge:Charge) {
  if(charge.status!=="pending" || charge.pixQrCodePayload) return;
  const c=await credential(charge), txid=txidFor(charge);
  const [sale]=await db.select().from(retailSales).where(and(eq(retailSales.id,charge.originId),eq(retailSales.organizationId,charge.organizationId))).limit(1);
  if(!sale || sale.status!=="pending_payment") return;
  const claimed=await db.transaction(async tx=>{
    const [current]=await tx.select().from(paymentCharges).where(eq(paymentCharges.id,charge.id)).for("update");
    if(current.metadata?.checkoutState!=="new") return false;
    await tx.update(paymentCharges).set({providerPaymentId:txid,paymentMethod:"pix",metadata:{...current.metadata,checkoutState:"creating",checkoutId:txid,expiresAt:new Date(Date.now()+86400000).toISOString()},updatedAt:new Date()}).where(eq(paymentCharges.id,charge.id));
    return true;
  });
  if(!claimed) return;
  try {
    const cob=await efiRequest<EfiPosCob>(`/v2/cob/${txid}`,c,{method:"PUT",body:{calendario:{expiracao:86400},valor:{original:(charge.amountInCents/100).toFixed(2)},chave:c.pixKey,solicitacaoPagador:`Compra #${sale.id.slice(0,8)}`}});
    normalizeEfiPos(charge,cob,c.pixKey);
    await saveQr(charge,cob,c);
  } catch {
    await db.transaction(async tx=>{
      const [current]=await tx.select().from(paymentCharges).where(eq(paymentCharges.id,charge.id)).for("update");
      await tx.update(paymentCharges).set({metadata:{...current.metadata,checkoutState:"uncertain",checkoutError:"Não foi possível confirmar o código Pix. Consulte a situação para recuperar a cobrança; não gere outra venda."},updatedAt:new Date()}).where(eq(paymentCharges.id,charge.id));
    });
  }
}
export async function refreshEfiPosPayment(charge:Charge) {
  const c=await credential(charge),cob=await efiRequest<EfiPosCob>(`/v2/cob/${txidFor(charge)}`,c);
  const payment=normalizeEfiPos(charge,cob,c.pixKey);
  if(payment) await new PosPaymentRepository(db).apply(charge.organizationId,charge.id,payment,"efi");
  else if(charge.status==="pending" && cob.status==="ATIVA" && !charge.pixQrCodePayload) await saveQr(charge,cob,c);
}
export async function cancelEfiPosCheckout(charge:Charge,user:string) {
  if(charge.status!=="pending") throw new Error("Confira o pagamento; esta cobrança não está pendente.");
  const c=await credential(charge),path=`/v2/cob/${txidFor(charge)}`;
  let cob=await efiRequest<EfiPosCob>(path,c);
  const repository=new PosPaymentRepository(db);
  const check=async()=>{const payment=normalizeEfiPos(charge,cob,c.pixKey);if(payment){await repository.apply(charge.organizationId,charge.id,payment,"efi");throw new Error("O provedor já processou um pagamento. Confira a situação antes de cancelar.");}};
  await check();
  if(cob.status==="ATIVA") await efiRequest(path,c,{method:"PATCH",body:{status:"REMOVIDA_PELO_USUARIO_RECEBEDOR"}});
  cob=await efiRequest<EfiPosCob>(path,c);await check();
  if(!["REMOVIDA_PELO_USUARIO_RECEBEDOR","REMOVIDA_PELO_PSP"].includes(cob.status)) throw new Error("O provedor ainda não confirmou o cancelamento. A reserva foi mantida.");
  await repository.cancelUnpaid(charge.organizationId,charge.originId,user,"efi");
}
