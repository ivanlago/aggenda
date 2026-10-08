export function roomBookingError(error: unknown): string | null {
  let current: unknown = error;
  const messages = ["Sala inválida para esta clínica.", "A sala selecionada está inativa.", "Nenhuma sala disponível neste horário. Escolha outro horário.", "A sala selecionada já está reservada neste horário."];
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const cause = current as { message?: string; cause?: unknown };
    if (cause.message && messages.includes(cause.message)) return cause.message;
    current = cause.cause;
  }
  return null;
}
