import { z } from "zod";

export const kitInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000),
  priceInCents: z.number().int().min(0).max(2147483647),
  isActive: z.boolean(),
  items: z.array(z.object({ type: z.enum(["product", "service"]), id: z.uuid(), quantity: z.number().int().min(1).max(10000) })).min(1).max(100),
});

