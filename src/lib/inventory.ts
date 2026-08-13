import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointmentInventoryConsumptions, appointments, inventoryMovements, inventoryProducts, serviceInventoryItems } from "@/db/schema";

export async function updateAppointmentAndInventory(input: { organizationId: string; appointmentId: string; status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show"; cancellationReason: string | null; userId: string }) {
  return db.transaction(async (tx) => {
    const [appointment] = await tx.select({ id: appointments.id, serviceId: appointments.serviceId, status: appointments.status }).from(appointments).where(and(eq(appointments.id, input.appointmentId), eq(appointments.organizationId, input.organizationId))).limit(1);
    if (!appointment) return false;
    if (input.status === "completed" && appointment.status !== "completed") {
      const recipe = await tx.select({ productId: serviceInventoryItems.productId, quantity: serviceInventoryItems.quantityMillis }).from(serviceInventoryItems).where(and(eq(serviceInventoryItems.organizationId, input.organizationId), eq(serviceInventoryItems.serviceId, appointment.serviceId)));
      if (recipe.length) {
        await tx.execute(sql`select id from inventory_products where id in (${sql.join(recipe.map((item) => sql`${item.productId}`), sql`, `)}) for update`);
        const products = await tx.select({ id: inventoryProducts.id, name: inventoryProducts.name, quantity: inventoryProducts.currentQuantityMillis }).from(inventoryProducts).where(eq(inventoryProducts.organizationId, input.organizationId));
        for (const item of recipe) { const product = products.find((candidate) => candidate.id === item.productId); if (!product || product.quantity < item.quantity) throw new Error(`Estoque insuficiente de ${product?.name ?? "produto da ficha técnica"}. Registre uma entrada antes de concluir.`); }
        for (const item of recipe) { const product = products.find((candidate) => candidate.id === item.productId)!; const balance = product.quantity - item.quantity; await tx.update(inventoryProducts).set({ currentQuantityMillis: balance, updatedAt: new Date() }).where(eq(inventoryProducts.id, item.productId)); await tx.insert(appointmentInventoryConsumptions).values({ organizationId: input.organizationId, appointmentId: input.appointmentId, productId: item.productId, quantityMillis: item.quantity }).onConflictDoUpdate({ target: [appointmentInventoryConsumptions.appointmentId, appointmentInventoryConsumptions.productId], set: { quantityMillis: item.quantity, consumedAt: new Date(), reversedAt: null } }); await tx.insert(inventoryMovements).values({ organizationId: input.organizationId, productId: item.productId, appointmentId: input.appointmentId, type: "consumption", quantityMillis: -item.quantity, balanceAfterMillis: balance, createdByUserId: input.userId }); }
      }
    } else if (input.status !== "completed" && appointment.status === "completed") {
      const consumed = await tx.select().from(appointmentInventoryConsumptions).where(and(eq(appointmentInventoryConsumptions.organizationId, input.organizationId), eq(appointmentInventoryConsumptions.appointmentId, input.appointmentId), isNull(appointmentInventoryConsumptions.reversedAt)));
      for (const item of consumed) { await tx.execute(sql`select id from inventory_products where id = ${item.productId} for update`); const [product] = await tx.select({ quantity: inventoryProducts.currentQuantityMillis }).from(inventoryProducts).where(eq(inventoryProducts.id, item.productId)).limit(1); if (!product) continue; const balance = product.quantity + item.quantityMillis; await tx.update(inventoryProducts).set({ currentQuantityMillis: balance, updatedAt: new Date() }).where(eq(inventoryProducts.id, item.productId)); await tx.update(appointmentInventoryConsumptions).set({ reversedAt: new Date() }).where(and(eq(appointmentInventoryConsumptions.appointmentId, input.appointmentId), eq(appointmentInventoryConsumptions.productId, item.productId))); await tx.insert(inventoryMovements).values({ organizationId: input.organizationId, productId: item.productId, appointmentId: input.appointmentId, type: "reversal", quantityMillis: item.quantityMillis, balanceAfterMillis: balance, createdByUserId: input.userId }); }
    }
    await tx.update(appointments).set({ status: input.status, confirmedAt: input.status === "confirmed" ? new Date() : undefined, cancellationReason: input.status === "cancelled" ? input.cancellationReason : null, updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));
    return true;
  });
}
