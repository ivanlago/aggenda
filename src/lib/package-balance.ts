import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  clientPackageBalances,
  clientPackages,
  packageUsages,
} from "@/db/schema";

export async function reservePackageSession({
  appointmentId,
  organizationId,
  clientId,
  serviceId,
  clientPackageId,
}: {
  appointmentId: string;
  organizationId: string;
  clientId: string;
  serviceId: string;
  clientPackageId: string;
}) {
  await db.transaction(async (tx) => {
    const [balance] = await tx
      .select({ id: clientPackageBalances.id })
      .from(clientPackageBalances)
      .innerJoin(
        clientPackages,
        eq(clientPackages.id, clientPackageBalances.clientPackageId)
      )
      .where(
        and(
          eq(clientPackageBalances.organizationId, organizationId),
          eq(clientPackageBalances.clientPackageId, clientPackageId),
          eq(clientPackageBalances.serviceId, serviceId),
          eq(clientPackages.clientId, clientId),
          eq(clientPackages.status, "active"),
          or(
            isNull(clientPackages.expiresAt),
            gt(clientPackages.expiresAt, new Date())
          )
        )
      )
      .limit(1);
    if (!balance) throw new Error("O pacote selecionado não é válido para este cliente e serviço.");

    const [updated] = await tx
      .update(clientPackageBalances)
      .set({
        usedQuantity: sql`${clientPackageBalances.usedQuantity} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientPackageBalances.id, balance.id),
          lt(clientPackageBalances.usedQuantity, clientPackageBalances.totalQuantity)
        )
      )
      .returning({ id: clientPackageBalances.id });
    if (!updated) throw new Error("Este pacote não possui saldo disponível para o serviço.");

    await tx.insert(packageUsages).values({
      organizationId,
      clientPackageId,
      balanceId: balance.id,
      appointmentId,
      status: "reserved",
    });
  });
}

export async function reconcilePackageUsage(
  appointmentId: string,
  status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show"
) {
  await db.transaction(async (tx) => {
    const [usage] = await tx
      .select()
      .from(packageUsages)
      .where(eq(packageUsages.appointmentId, appointmentId))
      .limit(1);
    if (!usage) return;

    if (status === "cancelled" && usage.status !== "reversed") {
      await tx
        .update(clientPackageBalances)
        .set({
          usedQuantity: sql`greatest(${clientPackageBalances.usedQuantity} - ${usage.quantity}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(clientPackageBalances.id, usage.balanceId));
      await tx
        .update(packageUsages)
        .set({ status: "reversed", reversedAt: new Date(), consumedAt: null })
        .where(eq(packageUsages.id, usage.id));
      return;
    }

    if ((status === "completed" || status === "no_show") && usage.status === "reserved") {
      await tx
        .update(packageUsages)
        .set({ status: "consumed", consumedAt: new Date(), reversedAt: null })
        .where(eq(packageUsages.id, usage.id));
    }
  });
}
