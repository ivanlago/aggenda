import { z } from "zod";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export const packageSearch = normalize;
export function packageAmount(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) throw new Error("Informe um valor em reais, por exemplo 499,00.");
  const cents = Math.round(Number(raw.replaceAll(".", "").replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2147483647) throw new Error("Valor inválido.");
  return cents;
}

export function parsePackageTemplate(data: FormData) {
  const items = [...data.entries()].filter(([key]) => key.startsWith("quantity:")).map(([key, value]) => ({ serviceId: z.uuid().parse(key.slice(9)), quantity: z.coerce.number().int().min(1).max(10000).parse(value) }));
  if (!items.length) throw new Error("Adicione ao menos um procedimento ao pacote.");
  if (new Set(items.map((item) => item.serviceId)).size !== items.length) throw new Error("Não repita procedimentos na composição.");
  const validity = String(data.get("validityDays") ?? "").trim();
  return {
    id: data.get("id") ? z.uuid().parse(data.get("id")) : undefined,
    name: z.string().trim().min(2).max(120).parse(data.get("name")),
    description: z.string().trim().max(5000).parse(data.get("description") ?? "") || null,
    priceInCents: packageAmount(data.get("price")),
    validityDays: validity ? z.coerce.number().int().min(1).max(36500).parse(validity) : null,
    items,
  };
}
export type PackageTemplateInput = Omit<ReturnType<typeof parsePackageTemplate>, "id"> & { id?: string };
export type PackageProcedure = { id: string; name: string; isActive?: boolean };
export type PackageTemplate = { id: string; name: string; description: string | null; priceInCents: number; validityDays: number | null; isActive: boolean; items: { serviceId: string; serviceName: string; quantity: number }[] };

export function packageSituation(status: string, expiresAt: Date | null, balances: { total: number; used: number; reserved: number }[], now: Date) {
  const remaining = balances.reduce((sum, balance) => sum + Math.max(0, balance.total - balance.used + balance.reserved), 0);
  if (status === "pending_payment") return { key: "pending_payment", label: "Aguardando pagamento", available: false };
  if (status !== "active") return { key: status, label: ({ cancelled: "Cancelado", refunded: "Estornado", suspended: "Suspenso", expired: "Vencido", partially_refunded: "Estorno parcial" } as Record<string, string>)[status] ?? "Indisponível", available: false };
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return { key: "expired", label: "Vencido", available: false };
  if (!remaining) return { key: "exhausted", label: "Esgotado", available: false };
  if (balances.every((balance) => balance.total - balance.used <= 0)) return { key: "reserved", label: "Sessões reservadas", available: true };
  return { key: "active", label: "Ativo", available: true };
}

export function packageSaleSelection(packageId: string | undefined, offerings: { id: string; kind?: string; stock: number; unavailableReason?: string }[]) {
  if (!packageId) return { cart: [], error: null };
  const selected = offerings.find((item) => item.id === `package:${packageId}` && item.kind === "package" && item.stock > 0 && !item.unavailableReason);
  return selected ? { cart: [{ variantId: selected.id, quantity: 1, discountInCents: 0 }], error: null } : { cart: [], error: "Este pacote não está disponível para venda. Confira os modelos ativos em Pacotes." };
}
