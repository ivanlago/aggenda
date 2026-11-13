type Reservation = { status: string; depositStatus: string; expiresAt?: Date | string | null };
export function bookingReservationLabel(item: Reservation, now = new Date()) {
  if (["scheduled", "confirmed"].includes(item.status)) {
    if (item.depositStatus === "direct_review") return "Pix em conferência";
    if (["pending", "direct_pending"].includes(item.depositStatus)) return item.expiresAt && new Date(item.expiresAt) <= now ? "Reserva expirada" : "Aguardando sinal";
  }
  return ({ scheduled: "Agendado", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído", no_show: "Não compareceu" } as Record<string,string>)[item.status] ?? item.status;
}
