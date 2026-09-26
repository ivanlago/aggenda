export function certificateDaysInWords(days: number): string {
  if (!Number.isInteger(days) || days < 1 || days > 365) return "";
  const units = ["","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","catorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  if (days < 20) return units[days];
  if (days < 100) return tens[Math.floor(days / 10)] + (days % 10 ? " e " + units[days % 10] : "");
  if (days === 100) return "cem";
  const hundreds = ["", "cento", "duzentos", "trezentos"];
  return hundreds[Math.floor(days / 100)] + (days % 100 ? " e " + certificateDaysInWords(days % 100) : "");
}
