export const paymentKinds = ["cash", "credit_card", "debit_card", "pix", "bank_transfer", "boleto", "other", "link"] as const;
export type PaymentKind = typeof paymentKinds[number];
export const paymentKindLabels: Record<PaymentKind, string> = { cash: "Dinheiro", credit_card: "Cartão de crédito", debit_card: "Cartão de débito", pix: "Pix", bank_transfer: "Transferência", boleto: "Boleto", other: "Outro", link: "Link de pagamento" };
export type PaymentCatalogMethod = { id: string; name: string; kind: string; defaultAccountId: string | null };
export type PaymentCatalogAccount = { id: string; name: string };

export function paymentKindSupported(kind: string, provider: string) {
  if (provider === "manual") return paymentKinds.includes(kind as PaymentKind);
  if (provider === "efi") return kind === "pix";
  if (provider === "asaas") return ["pix", "boleto", "credit_card", "link"].includes(kind);
  return ["mercado_pago", "pagbank"].includes(provider) && ["pix", "boleto", "credit_card", "debit_card", "link"].includes(kind);
}

export function choosePayment(methods: PaymentCatalogMethod[], accounts: PaymentCatalogAccount[], token: string, accountId?: string | null, provider = "manual") {
  const id = token.startsWith("custom:") ? token.slice(7) : token;
  const method = methods.find(item => item.id === id);
  if (!method || !paymentKindSupported(method.kind, provider)) throw new Error("Selecione uma forma de pagamento ativa e compatível em Formas de Pagamento.");
  const destination = (provider === "manual" && accountId) || method.defaultAccountId;
  if (!destination || !accounts.some(account => account.id === destination)) throw new Error("Informe uma conta de destino ativa da empresa para o pagamento.");
  return { method: method.kind, paymentMethodId: method.id, paymentMethodName: method.name, accountId: destination };
}

export function hostedPaymentTypes(provider: string, kind: string) {
  const supported = hostedKinds[provider] ?? [];
  const kinds = kind === "link" ? supported : supported.filter(item => item === kind);
  if (!kinds.length) throw new Error("Esta forma não é compatível com o checkout deste provedor.");
  const names: Record<string, string> = { pix: "PIX", credit_card: "CREDIT_CARD", debit_card: "DEBIT_CARD", boleto: "BOLETO" };
  return kinds.map(item => names[item]);
}

const hostedKinds: Record<string, string[]> = {
  asaas: ["pix", "credit_card"],
  efi: ["pix"],
  mercado_pago: ["pix", "credit_card", "debit_card", "boleto"],
  pagbank: ["pix", "credit_card", "debit_card", "boleto"],
};

export function hostedPaymentKindSupported(kind: string, provider: string) {
  const kinds = hostedKinds[provider];
  return Boolean(kinds?.length && (kind === "link" || kinds.includes(kind)));
}

export function mercadoPagoMethodSettings(kind: string) {
  if (kind === "link" || !kind) return {};
  const allowed: Record<string, string> = { pix: "bank_transfer", boleto: "ticket", credit_card: "credit_card", debit_card: "debit_card" };
  if (!allowed[kind]) throw new Error("Forma incompatível com Mercado Pago.");
  return { excluded_payment_types: ["credit_card", "debit_card", "prepaid_card", "ticket", "bank_transfer"].filter(type => type !== allowed[kind]).map(id => ({ id })) };
}

export function pagBankInstallmentPolicy(maximum: unknown, interestFree: unknown, providerMaximum = 12) {
  if (typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 1 || maximum > providerMaximum
      || typeof interestFree !== "number" || !Number.isInteger(interestFree) || interestFree < 0 || interestFree > maximum) return null;
  return { maximum, interestFree };
}

export function onlineInstallmentRules(metadata?: Record<string, unknown> | null) {
  const terms = pagBankInstallmentPolicy(metadata?.maxCardInstallments, metadata?.interestFreeCardInstallments, 24)
    ?? { maximum: 1, interestFree: 0 };
  const minimum = metadata?.minimumCardInstallmentInCents;
  return {
    ...terms,
    minimumInCents: typeof minimum === "number" && Number.isSafeInteger(minimum) && minimum >= 1 ? minimum : 500,
    allowBuyerInterest: true,
    useProviderMaximum: false,
  };
}

export type OnlineInstallmentRules = ReturnType<typeof onlineInstallmentRules>;

export function effectiveInstallmentTerms(rules: OnlineInstallmentRules, amountInCents: number) {
  const maximum = Math.max(1, Math.min(rules.maximum, Math.floor(amountInCents / rules.minimumInCents),
    rules.allowBuyerInterest ? rules.maximum : rules.interestFree));
  return { maximum, interestFree: Math.min(maximum, rules.interestFree) };
}

export function onlineInstallmentTerms(rules: OnlineInstallmentRules, amount: number, provider: string) {
  const providerMaximum = provider === "pagbank" ? 12 : provider === "asaas" ? 21 : provider === "mercado_pago" ? 24 : 1;
  const terms = effectiveInstallmentTerms({
    ...rules,
    maximum: Math.min(rules.maximum, providerMaximum),
    minimumInCents: provider === "pagbank" ? Math.max(500, rules.minimumInCents) : rules.minimumInCents,
  }, amount);
  // PagBank's combined offer may subsidize part of the cost above the free tier.
  const mixedUnavailable = provider === "pagbank" && terms.interestFree > 1 && terms.maximum > terms.interestFree;
  const interestFree = provider === "pagbank" && terms.maximum > 1 && terms.interestFree === 1 ? 0 : terms.interestFree;
  return { interestFree, maximum: mixedUnavailable ? terms.interestFree : terms.maximum, mixedUnavailable };
}

export function pagBankSaleRules(defaults: OnlineInstallmentRules, data: FormData, canOverride: boolean): OnlineInstallmentRules {
  if (data.get("overridePagBankTerms") !== "on") return defaults;
  if (!canOverride) throw new Error("Seu perfil não pode alterar as condições de parcelamento.");
  const terms = pagBankInstallmentPolicy(Number(data.get("pagBankMaximum")), Number(data.get("pagBankInterestFree")));
  if (!terms) throw new Error("Confira o máximo de parcelas e o limite sem juros.");
  return { ...defaults, ...terms, useProviderMaximum: false, allowBuyerInterest: data.get("pagBankBuyerInterest") === "on" };
}

export function pagBankCardConfig(maximum: number, interestFree = 0) {
  return [{
    type: "CREDIT_CARD",
    config_options: [
      { option: "INSTALLMENTS_LIMIT", value: String(maximum) },
      ...(interestFree > 0 ? [{ option: "INTEREST_FREE_INSTALLMENTS", value: String(Math.min(interestFree, maximum)) }] : []),
    ],
  }];
}
