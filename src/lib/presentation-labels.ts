export const paymentMethodLabels: Record<string, string> = {
  cash: "Dinheiro", card: "Cartão", credit_card: "Cartão de crédito", debit_card: "Cartão de débito",
  pix: "Pix", bank_transfer: "Transferência", transfer: "Transferência", boleto: "Boleto", other: "Outra forma",
  mercado_pago: "Mercado Pago", asaas: "Asaas", pagbank: "PagBank", efi: "Efí Bank",
};
export function paymentMethodLabel(value: string) { return paymentMethodLabels[value] ?? "Outra forma de pagamento"; }
export const roleLabels: Record<string, string> = { owner: "Administrador", admin: "Administrador", manager: "Gerente", professional: "Profissional", receptionist: "Recepcionista", financial: "Financeiro", super_admin: "Administrador da plataforma" };
export const subscriptionStatusLabels: Record<string, string> = { active: "Ativa", trialing: "Em avaliação", pending: "Pendente", past_due: "Pagamento pendente", cancelled: "Cancelada", canceled: "Cancelada", expired: "Expirada", inactive: "Inativa", unpaid: "Não paga" };
