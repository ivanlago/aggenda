export const posProviderNames: Record<string, string> = { asaas: "Asaas", mercado_pago: "Mercado Pago", pagbank: "PagBank" };
export function posProviderReady(row: {provider:string;status:string;metadata:Record<string,unknown>|null}) {
  return Object.hasOwn(posProviderNames,row.provider) && row.status === "active" && row.metadata?.webhookStatus === (row.provider === "asaas" ? "active" : "configured");
}
