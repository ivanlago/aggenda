export function attendanceCompletionError(input: {
  pendingItems: number;
  primaryRemoved: boolean;
  primaryAmount: number;
  primaryPaymentStatus?: string | null;
  primaryPackageStatus?: string | null;
  unpaidAdditional: boolean;
}) {
  if (input.pendingItems > 0 || input.unpaidAdditional) return "Existem produtos/procedimentos pendentes de pagamento. Receba os valores em Venda e orçamento antes de finalizar o atendimento.";
  const covered = ["reserved", "consumed"].includes(input.primaryPackageStatus ?? "");
  if (!input.primaryRemoved && input.primaryAmount > 0 && input.primaryPaymentStatus !== "received" && !covered) return "Receba o pagamento do procedimento principal ou vincule um pacote antes de finalizar o atendimento.";
  return null;
}
