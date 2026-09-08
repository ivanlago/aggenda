import { z } from "zod";

const quoteItemsSchema = z.array(z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(1000),
  unitPrice: z.number().int().min(0).max(100000000),
})).min(1).max(50);

export function calculateAttendanceQuote(input: unknown) {
  const items = quoteItemsSchema.parse(input);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return { items, total };
}
