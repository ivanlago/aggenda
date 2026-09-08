export function splitPosPackagePrice(total: number, quantity: number) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error("Valor ou quantidade de pacotes inválida.");
  return Array.from({ length: quantity }, (_, index) => Math.floor(total / quantity) + (index < total % quantity ? 1 : 0));
}
