export type VoucherRule = {
  code: string; discountType: string; discountValue: number; maxUses: number | null;
  usedCount: number; isActive: boolean; validFrom: Date; validUntil: Date | null; clientId: string | null;
};

export function voucherCode(value: string) { return value.trim().toUpperCase(); }

export function voucherError(voucher: VoucherRule | undefined, clientId: string, now = new Date()) {
  if (!voucher || !voucher.isActive || voucher.validFrom > now || (voucher.validUntil && voucher.validUntil < now)
    || (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses)
    || (voucher.clientId !== null && voucher.clientId !== clientId)) return "Voucher inválido, expirado, esgotado ou indisponível para este cliente.";
  return null;
}

export function voucherPrice(price: number | null, voucher?: Pick<VoucherRule, "discountType" | "discountValue">) {
  const originalPrice = price ?? 0;
  const discount = voucher ? voucher.discountType === "percentage" ? Math.round(originalPrice * voucher.discountValue / 100) : voucher.discountValue : 0;
  const discountInCents = Math.min(originalPrice, Math.max(0, discount));
  return { originalPriceInCents: originalPrice, discountInCents, finalPriceInCents: originalPrice - discountInCents };
}

export function voucherValue(raw: string, type: string) {
  const value = raw.trim();
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um benefício válido.");
  const number = Number(normalized);
  const result = type === "percentage" ? number : Math.round(number * 100);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 2147483647 || (type === "percentage" && result > 100)) throw new Error("Informe um valor positivo ou um percentual inteiro de 1 a 100.");
  return result;
}

export function voucherBenefit(voucher: Pick<VoucherRule, "discountType" | "discountValue">) {
  return voucher.discountType === "percentage" ? `${voucher.discountValue}% de desconto` : `${(voucher.discountValue / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`;
}

export function voucherBookingUrl(organization: { slug: string; customDomain?: string | null; customDomainVerifiedAt?: Date | null }, code: string, baseUrl: string) {
  const base = organization.customDomain && organization.customDomainVerifiedAt ? `https://${organization.customDomain}` : baseUrl;
  const url = new URL(`/cliente/${encodeURIComponent(organization.slug)}`, base);
  url.searchParams.set("novo", "1"); url.searchParams.set("voucher", code);
  return url.toString();
}

export function voucherMessage(input: { clientName: string; organizationName: string; benefit: string; code: string; validity: string; url: string; exclusive: boolean }) {
  return `Olá, ${input.clientName}! A ${input.organizationName} oferece ${input.benefit} no seu próximo agendamento. Use o código ${input.code}. ${input.validity}.${input.exclusive ? " Este voucher é exclusivo para você." : ""} Agende aqui: ${input.url}`;
}
