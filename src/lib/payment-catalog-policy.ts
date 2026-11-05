export const paymentKinds = ["cash", "credit_card", "debit_card", "pix", "bank_transfer", "boleto", "other", "link"] as const;
export type PaymentKind = typeof paymentKinds[number];
export const paymentKindLabels: Record<PaymentKind, string> = { cash: "Dinheiro", credit_card: "Cartão de crédito", debit_card: "Cartão de débito", pix: "Pix", bank_transfer: "Transferência", boleto: "Boleto", other: "Outro", link: "Link de pagamento" };
export const paymentProviders = ["manual", "mercado_pago", "asaas", "pagbank", "efi"] as const;
export type PaymentCatalogMethod = { id: string; name: string; kind: string; provider: string; defaultAccountId: string | null };
export type PaymentCatalogAccount = { id: string; name: string };

export function paymentKindSupported(kind: string, provider: string) {
  if (provider === "manual") return kind !== "link" && paymentKinds.includes(kind as PaymentKind);
  if (provider === "efi") return kind === "pix";
  if (provider === "asaas") return ["pix", "boleto", "credit_card", "link"].includes(kind);
  return ["mercado_pago", "pagbank"].includes(provider) && ["pix", "boleto", "credit_card", "debit_card", "link"].includes(kind);
}

export function choosePayment(methods: PaymentCatalogMethod[], accounts: PaymentCatalogAccount[], token: string, accountId?: string | null, provider = "manual") {
  const id = token.startsWith("custom:") ? token.slice(7) : token;
  const method = methods.find(item => item.id === id && item.provider === provider);
  if (!method || !paymentKindSupported(method.kind, provider)) throw new Error("Selecione uma forma de pagamento ativa e compatível em Formas de Pagamento.");
  const destination = accountId || method.defaultAccountId;
  if (!destination || !accounts.some(account => account.id === destination)) throw new Error("Informe uma conta de destino ativa da empresa para o pagamento.");
  return { method: method.kind, paymentMethodId: method.id, paymentMethodName: method.name, accountId: destination };
}

export function hostedPaymentTypes(provider: string, kind: string) {
  const supported = provider === "asaas" ? ["pix", "credit_card"] : provider === "efi" ? ["pix"] : ["pix", "credit_card", "debit_card", "boleto"];
  const kinds = kind === "link" ? supported : supported.filter(item => item === kind);
  if (!kinds.length) throw new Error("Esta forma não é compatível com o checkout deste provedor.");
  const names: Record<string, string> = { pix: "PIX", credit_card: "CREDIT_CARD", debit_card: "DEBIT_CARD", boleto: "BOLETO" };
  return kinds.map(item => names[item]);
}

export function mercadoPagoMethodSettings(kind: string) {
  if (kind === "link" || !kind) return {};
  const allowed: Record<string, string> = { pix: "bank_transfer", boleto: "ticket", credit_card: "credit_card", debit_card: "debit_card" };
  if (!allowed[kind]) throw new Error("Forma incompatível com Mercado Pago.");
  return { excluded_payment_types: ["credit_card", "debit_card", "prepaid_card", "ticket", "atm", "bank_transfer", "account_money"].filter(type => type !== allowed[kind]).map(id => ({ id })) };
}
