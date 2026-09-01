export function normalizeWhatsAppCommand(text: string) {
  return text.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isAffirmativeWhatsAppCommand(text: string) {
  return ["SIM", "CONFIRMAR", "CONFIRMO", "CONFIRMADO", "PODE CONFIRMAR"].includes(normalizeWhatsAppCommand(text));
}

export function isNegativeWhatsAppCommand(text: string) {
  return ["NAO", "CANCELAR", "DESISTIR", "NAO CONFIRMAR"].includes(normalizeWhatsAppCommand(text));
}
