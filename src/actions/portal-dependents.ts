"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, clientPortalDependents, clients } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function setPortalDependent(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const guardianId = String(data.get("guardianId") || ""), clientId = String(data.get("clientId") || "");
  if (guardianId === clientId || ![guardianId, clientId].every(id => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) return { error: "Selecione um responsável e um dependente diferentes." };
  const revoke = data.get("revoke") === "1";
  if (!revoke && data.get("authorized") !== "on") return { error: "Confirme a autorização do responsável antes de vincular o dependente." };
  await db.transaction(async tx => {
    for (const id of [guardianId, clientId]) {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, id), eq(clients.organizationId, organization.id))).limit(1);
      if (!client) throw new Error("Cadastro não encontrado nesta clínica.");
    }
    if (revoke) await tx.delete(clientPortalDependents).where(and(eq(clientPortalDependents.organizationId, organization.id), eq(clientPortalDependents.guardianId, guardianId), eq(clientPortalDependents.clientId, clientId)));
    else await tx.insert(clientPortalDependents).values({ organizationId: organization.id, guardianId, clientId, createdBy: session.user.id }).onConflictDoNothing();
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: revoke ? "revoke" : "authorize", entityType: "portal_dependent", entityId: clientId, details: { guardianId, clientId, scope: "appointments_only" } });
  });
  revalidatePath(`/clientes/${guardianId}`);
  revalidatePath(`/cliente/${organization.slug}`);
}
