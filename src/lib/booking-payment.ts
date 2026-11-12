export type BookingPaymentSettings = {
  mode: "integrated" | "pix_direct";
  keyType?: "cpf" | "cnpj" | "email" | "phone" | "random";
  key?: string;
  receiverName?: string;
  city?: string;
  accountId?: string;
};

export type DirectPixReservation = {
  key: string;
  receiverName: string;
  city: string;
  accountId: string;
  payload: string;
  entryId: string;
  reportedAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
};

export function bookingPaymentSettings(value: BookingPaymentSettings | null | undefined): BookingPaymentSettings {
  return value?.mode === "pix_direct" ? value : { mode: "integrated" };
}

export function directPixReservation(metadata: Record<string, unknown> | null | undefined): DirectPixReservation | null {
  const value = metadata?.directPix as DirectPixReservation | undefined;
  return value && typeof value.key === "string" && typeof value.payload === "string" && typeof value.entryId === "string" && typeof value.accountId === "string" ? value : null;
}

export function pendingDeposit(status: string) {
  return ["pending", "direct_pending", "direct_review"].includes(status);
}

export function normalizePixKey(type: string, value: string) {
  const key = value.trim();
  if (type === "email" && /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(key) && key.length <= 77) return key.toLowerCase();
  if (type === "random" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(key)) return key.toLowerCase();
  if (["cpf", "cnpj"].includes(type)) {
    const digits = key.replace(/\D/g, "");
    if (digits.length === (type === "cpf" ? 11 : 14) && !/^(\d)\1+$/.test(digits)) return digits;
  }
  if (type === "phone") {
    const digits = key.replace(/\D/g, "");
    const international = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
    if (/^55\d{10,11}$/.test(international)) return `+${international}`;
  }
  throw new Error("Informe uma chave Pix válida para o tipo selecionado.");
}

const ascii = (value: string, limit: number) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 $%*+\-./:]/g, "").trim().slice(0, limit);
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

export function pixCrc16(value: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function createDirectPixPayload(input: { key: string; receiverName: string; city: string; amountInCents: number; reference: string }) {
  if (!Number.isSafeInteger(input.amountInCents) || input.amountInCents <= 0) throw new Error("Valor Pix inválido.");
  if (!input.key || input.key.length > 77) throw new Error("Chave Pix inválida.");
  const name = ascii(input.receiverName, 25), city = ascii(input.city, 15);
  if (!name || !city) throw new Error("Informe titular e cidade do recebedor Pix.");
  const txid = input.reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const value = field("00", "01") + field("26", field("00", "br.gov.bcb.pix") + field("01", input.key)) + field("52", "0000") + field("53", "986") + field("54", (input.amountInCents / 100).toFixed(2)) + field("58", "BR") + field("59", name) + field("60", city) + field("62", field("05", txid)) + "6304";
  return value + pixCrc16(value);
}
