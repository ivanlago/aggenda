"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, organizationServicePlans, outboxEvents, whatsappChannels } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");

export async function sendRecoveryMessage(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const clientId = text(data, "clientId");
  const [[client], [channel], [plan]] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1),
    db.select().from(whatsappChannels).where(and(eq(whatsappChannels.organizationId, organization.id), eq(whatsappChannels.isActive, true))).limit(1),
    db.select().from(organizationServicePlans).where(eq(organizationServicePlans.organizationId, organization.id)).limit(1),
  ]);
  const phone = digits(client?.phone ?? "");
  if (!client || !channel || !phone || plan?.whatsappServiceCode === "assisted") throw new Error("Este contato requer um canal WhatsApp Cloud API ativo.");
  const to = phone.startsWith("55") ? phone : `55${phone}`;
  await db.insert(outboxEvents).values({ organizationId: organization.id, eventKey: `whatsapp:recovery:${client.id}:${new Date().toISOString().slice(0, 10)}`, eventType: "whatsapp.template.send", aggregateType: "client", aggregateId: client.id, payload: { organizationId: organization.id, channelId: channel.id, phoneNumberId: channel.phoneNumberId, to, notificationKind: "recovery", clientId: client.id, languageCode: "pt_BR", parameters: [client.name, organization.name, `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/agendar/${organization.slug}`], preview: `Olá, ${client.name}! Sentimos sua falta na ${organization.name}. Quer reservar um novo horário?` } }).onConflictDoNothing({ target: outboxEvents.eventKey });
  await triggerOutboxWorker();
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "queue", entityType: "whatsapp_recovery", entityId: client.id });
  revalidatePath("/crescimento");
}
