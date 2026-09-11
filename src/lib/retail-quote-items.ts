import { z } from "zod";

export const quoteItemsSchema = z.array(z.object({
  variantId: z.string().regex(/^(?:(?:service|package):)?[0-9a-f-]{36}$/i),
  quantity: z.number().int().min(1).max(10000),
  discountInCents: z.number().int().min(0).max(100000000),
})).min(1).max(50).refine((items) => new Set(items.map((item) => item.variantId)).size === items.length, "Itens duplicados.");

export type QuoteLine = {
  variantId: string;
  label: string;
  kind: "product" | "service" | "package";
  quantity: number;
  unitPriceInCents: number;
  discountInCents: number;
};

export function quoteTotals(items: QuoteLine[]) {
  const subtotalInCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceInCents, 0);
  const discountInCents = items.reduce((sum, item) => sum + item.discountInCents, 0);
  if (items.some((item) => !Number.isSafeInteger(item.unitPriceInCents) || item.unitPriceInCents < 0 || item.discountInCents > item.quantity * item.unitPriceInCents || (item.kind === "package" && item.quantity > 100)) || !Number.isSafeInteger(subtotalInCents) || subtotalInCents > 100000000) throw new Error("Revise os valores e as quantidades do orçamento.");
  return { subtotalInCents, discountInCents, totalInCents: subtotalInCents - discountInCents };
}

export function matchesQuoteItems(items: { variantId: string; quantity: number; discountInCents: number }[], lines: QuoteLine[]) {
  return items.length === lines.length && lines.every((line) => items.some((item) => item.variantId === line.variantId && item.quantity === line.quantity && item.discountInCents === line.discountInCents));
}
