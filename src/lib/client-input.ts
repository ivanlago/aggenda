import { z } from "zod";
import { parseClientMeasurement } from "./client-measurements";
import { normalizeBrazilianPhone } from "./phone";

export class ClientInputError extends Error {}
export const duplicateClientPhoneMessage = "Este WhatsApp já está cadastrado para outro cliente desta empresa. Informe outro número ou deixe o campo em branco.";

export function parseClientInput(data: FormData) {
  const optional = (key: string) => String(data.get(key) ?? "").trim() || null;
  const name = optional("name") ?? "";
  if (name.length < 2) throw new ClientInputError("Informe o nome do cliente com pelo menos dois caracteres.");
  const phoneValue = optional("phone");
  const phone = phoneValue ? normalizeBrazilianPhone(phoneValue) : null;
  if (phone !== null && !/^\d{10,11}$/.test(phone)) throw new ClientInputError("Informe um WhatsApp com DDD e número completo ou deixe o campo em branco.");
  const email = optional("email");
  if (email && !z.email().safeParse(email).success) throw new ClientInputError("Informe um e-mail válido ou deixe o campo em branco.");
  const birthDate = optional("birthDate");
  if (birthDate && !z.iso.date().safeParse(birthDate).success) throw new ClientInputError("Informe uma data de nascimento válida ou deixe o campo em branco.");
  let weightKg, heightCm;
  try {
    weightKg = parseClientMeasurement(data.get("weightKg"), "weightKg");
    heightCm = parseClientMeasurement(data.get("heightCm"), "heightCm");
  } catch (error) { throw new ClientInputError((error as Error).message); }
  return { name, phone, email, birthDate, weightKg, heightCm, gender: optional("gender"), address: optional("address"), postalCode: optional("postalCode"), maritalStatus: optional("maritalStatus"), cpf: optional("cpf"), profession: optional("profession"), notes: optional("notes") };
}

export function clientSaveError(error: unknown): string | null {
  if (error instanceof ClientInputError) return error.message;
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "23505" && "constraint" in current && current.constraint === "clients_organization_phone_unique") return duplicateClientPhoneMessage;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}
