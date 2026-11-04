import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";

export function activePaymentMethods(organizationId: string) {
  return db.select({ id: paymentMethods.id, name: paymentMethods.name }).from(paymentMethods)
    .where(and(eq(paymentMethods.organizationId, organizationId), eq(paymentMethods.isActive, true)))
    .orderBy(asc(paymentMethods.name));
}
