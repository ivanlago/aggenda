export function parseClientMeasurement(value: FormDataEntryValue | null, field: "weightKg" | "heightCm"): string | null {
  const raw = typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!raw) return null;
  const number = Number(raw);
  const max = field === "weightKg" ? 9999.99 : 999.99;
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(number) || number <= 0 || number > max) {
    throw new Error(`Informe ${field === "weightKg" ? "um peso em kg" : "uma altura em cm"} válido, maior que zero e com até duas casas decimais.`);
  }
  return number.toFixed(2);
}
