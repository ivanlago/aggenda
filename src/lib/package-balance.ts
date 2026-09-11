import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

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
}, executor: typeof db = db) {
  await executor.transaction(async (tx) => {
    const [balance] = await tx
      .select({ id: clientPackageBalances.id, total: clientPackageBalances.totalQuantity, used: clientPackageBalances.usedQuantity })
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
      .limit(1).for("update", { of: clientPackages });
    if (!balance) throw new Error("O pacote selecionado não é válido para este cliente e serviço.");

    // Legacy usedQuantity tracks commitments (reserved + consumed), not consumption alone.
    const [updated] = await tx.update(clientPackageBalances).set({ usedQuantity: sql`${clientPackageBalances.usedQuantity} + 1`, updatedAt: new Date() }).where(and(eq(clientPackageBalances.id, balance.id), sql`${clientPackageBalances.usedQuantity} < ${clientPackageBalances.totalQuantity}`)).returning({ id: clientPackageBalances.id });
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
  status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show",
  executor: typeof db = db,
) {
  await executor.transaction(async (tx) => {
    const [usage] = await tx
      .select()
      .from(packageUsages)
      .where(eq(packageUsages.appointmentId, appointmentId))
      .limit(1).for("update");
    if (!usage) return;
    await tx.execute(sql`select id from client_packages where id = ${usage.clientPackageId} for update`);
    const target = status === "completed" ? "consumed" : status === "cancelled" || status === "no_show" ? "reversed" : "reserved";
    if (usage.status === target) return;
    if (target === "reversed" && usage.status !== "reversed") {
      await tx
        .update(clientPackageBalances)
        .set({
          usedQuantity: sql`greatest(${clientPackageBalances.usedQuantity} - ${usage.quantity}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(clientPackageBalances.id, usage.balanceId));
    }
    if (target !== "reversed" && usage.status === "reversed") {
      const [updated] = await tx.update(clientPackageBalances).set({ usedQuantity: sql`${clientPackageBalances.usedQuantity} + ${usage.quantity}`, updatedAt: new Date() }).where(and(eq(clientPackageBalances.id, usage.balanceId), sql`${clientPackageBalances.usedQuantity} + ${usage.quantity} <= ${clientPackageBalances.totalQuantity}`)).returning({ id: clientPackageBalances.id });
      if (!updated) throw new Error("Saldo insuficiente no pacote para concluir ou reabrir este atendimento.");
    }
    await tx.update(packageUsages).set({ status: target, consumedAt: target === "consumed" ? new Date() : null, reversedAt: target === "reversed" ? new Date() : null }).where(eq(packageUsages.id, usage.id));
  });
}
