export function bookingDepositAmount(price: number | null, type: string | undefined, value = 0) {
  const total = Math.max(0, price ?? 0);
  return type === "full" ? total : type === "fixed" ? Math.min(total, value) : type === "percentage" ? Math.round(total * value / 100) : 0;
}

export const bookingDepositAgentInstructions = "Pagamento antecipado: consulte depositType, depositValue e bookingPaymentMode. Não invente chave Pix, QR Code, código Copia e Cola ou confirmação de crédito. Para serviço com sinal, informe o preço e a regra do catálogo, continue a escolha de profissional, data e horário usando availability e prepare_booking. Depois da escolha, a aplicação encaminha à área do cliente com os dados selecionados para revisar, reservar e pagar. Não encaminhe antes de consultar os horários quando o cliente desejar agendar. No pix_direct a equipe confere o crédito; dizer que pagou ou enviar comprovante não confirma o recebimento. No integrated a confirmação vem do provedor. Nunca use confirm_appointment para dar baixa em pagamento. Diferencie reserva aguardando sinal, Pix informado aguardando conferência e sinal recebido. Não afirme que uma reserva pendente está confirmada.";

export function depositServiceNotice(service: { priceInCents: number | null; depositType?: string; depositValue?: number }, mode: string) {
  const amount = bookingDepositAmount(service.priceInCents, service.depositType, service.depositValue);
  if (!amount) return "";
  const money = (amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `${service.depositType === "full" ? "Pagamento antecipado" : "Sinal"}: ${money}. ${mode === "pix_direct" ? "Pix direto, com conferência do crédito pela equipe." : "Pagamento integrado, com confirmação pelo provedor."}`;
}

export function depositBookingGuidance(service: { priceInCents: number | null; depositType?: string; depositValue?: number }, mode: string, link: string | null) {
  if (!link) return "Este serviço exige pagamento antecipado. Encaminhei sua solicitação à equipe para concluir a reserva. Nenhum horário foi reservado nesta conversa.";
  return `${depositServiceNotice(service, mode)}\nConclua a reserva na área do cliente:\n${link}\n${mode === "pix_direct" ? "A página exibirá o QR Code e o Pix Copia e Cola com o valor da reserva. Depois de transferir, clique em Já fiz o Pix. A equipe conferirá o crédito antes de confirmar." : "A página gerará o pagamento. Aguarde a confirmação do provedor."}\nNenhum horário foi reservado nesta conversa.`;
}

export function asksAboutBookingPayment(text: string) {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(pix|sinal|paguei|ja paguei|ja fiz o pagamento|ja fiz a transferencia|pagamento antecipado|pagar (a |o )?(reserva|agendamento))\b/.test(value);
}

// A question about the terms of a new service must not select an older receipt.
export function asksAboutNewBookingPayment(text: string) {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!asksAboutBookingPayment(text)) return false;
  return /\b(preciso|devo|tem que|tenho que|e necessario).*pagar\b/.test(value)
    || /\b(quanto|qual).*\b(sinal|pagamento antecipado)\b/.test(value)
    || /\b(agendar|marcar|reservar)\b/.test(value)
    || (/\b(quero|gostaria|desejo)\b/.test(value) && /\b(quanto custa|amanha|hoje|tem sinal|tem algum sinal)\b/.test(value));
}

export function depositStatusLabel(status: string) {
  return status === "direct_pending" ? "aguardando Pix" : status === "direct_review" ? "Pix informado, aguardando conferência" : status === "pending" ? "aguardando pagamento" : status === "paid" ? "sinal recebido" : null;
}
