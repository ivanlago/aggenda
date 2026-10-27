export const posProviderNames: Record<string, string> = { asaas: "Asaas", mercado_pago: "Mercado Pago", pagbank: "PagBank", efi:"Efí (Pix)" };
export function posProviderReady(row: {provider:string;status:string;metadata:Record<string,unknown>|null}) {
  return Object.hasOwn(posProviderNames,row.provider) && row.status === "active" && row.metadata?.webhookStatus === (["asaas","efi"].includes(row.provider) ? "active" : "configured");
}
export function buildPosPaymentSettings(rows:{provider:string;status:string;metadata:Record<string,unknown>|null;environment:string;isDefault:boolean}[]) {
  // Eligibility controls visibility. The default flag only controls the initial selection.
  const providers=rows.filter(posProviderReady).map(row=>({id:row.provider,name:posProviderNames[row.provider],environment:row.environment,isDefault:row.isDefault}));
  return {providers,defaultProvider:providers.find(row=>row.isDefault)?.id??"manual"};
}
