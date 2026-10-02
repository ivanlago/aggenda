export function serviceDepositSettings(formData: FormData) {
  const depositType = String(formData.get("depositType") ?? "none");
  if (depositType === "none" || depositType === "full") return { depositType, depositValue: 0 };
  if (depositType !== "fixed" && depositType !== "percentage") throw new Error("Tipo de sinal inválido.");
  const raw = String(formData.get("depositValue") ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor de sinal válido.");
  const amount = Number(normalized);
  if (depositType === "percentage" && (!Number.isInteger(amount) || amount > 100)) throw new Error("Informe um percentual inteiro entre 0 e 100.");
  const depositValue = depositType === "fixed" ? Math.round(amount * 100) : amount;
  if (!Number.isSafeInteger(depositValue) || depositValue > 2147483647) throw new Error("Valor do sinal acima do permitido.");
  return { depositType, depositValue };
}

export function serviceDepositDisplay(type: string, value: number) {
  return type === "fixed" ? (value / 100).toFixed(2).replace(".", ",") : type === "percentage" ? String(value) : "";
}
