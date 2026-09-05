export function normalizeBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits.slice(2);
  return digits.slice(0, 11);
}

function formatNationalPhone(digits: string) {
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) return `(${area}) ${number}`;
  const split = number.length > 8 ? 5 : 4;
  return `(${area}) ${number.slice(0, split)}-${number.slice(split)}`;
}

export function formatBrazilianPhoneInput(value: string) {
  return formatNationalPhone(normalizeBrazilianPhone(value));
}

export function formatPhone(value?: string | null) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return formatNationalPhone(digits);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return `+55 ${formatNationalPhone(digits.slice(2))}`;
  if (digits.startsWith("1") && digits.length === 11) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return value;
}
