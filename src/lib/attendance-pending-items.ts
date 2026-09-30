import { z } from "zod";

const itemsSchema = z.array(z.object({ id: z.uuid(), catalogId: z.string(), label: z.string(), quantity: z.number().int().positive() }));
export function attendancePendingItems(metadata: Record<string, unknown> | null | undefined) {
  const parsed = itemsSchema.safeParse(metadata?.pendingAttendanceItems ?? []);
  return parsed.success ? parsed.data : [];
}

export function pendingItemsInCart(pending: { id: string; catalogId: string; quantity: number }[], cart: { variantId: string; quantity: number }[]) {
  const remaining = new Map(cart.map((item) => [item.variantId, item.quantity]));
  return pending.filter((item) => {
    const available = remaining.get(item.catalogId) ?? 0;
    if (available < item.quantity) return false;
    remaining.set(item.catalogId, available - item.quantity);
    return true;
  }).map((item) => item.id);
}
