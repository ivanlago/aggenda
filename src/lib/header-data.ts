import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { chatConversations, professionalRegistrations, professionals, professions } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { getOrganizationServicePlan } from "@/lib/service-plans";

export async function getOpenCommercialConversationCount(organizationId: string, role: string) {
  if (!hasOrganizationPermission(role, "crm.read")) return null;
  const plan = await getOrganizationServicePlan(organizationId);
  if (plan.isLegacyFallback || !["menu", "chat", "chat_ai", "core_ai"].includes(plan.whatsappServiceCode)) return null;
  const [result] = await db.select({ total: count() }).from(chatConversations).where(and(eq(chatConversations.organizationId, organizationId), ne(chatConversations.handoffStatus, "resolved")));
  return result.total;
}

export async function getHeaderIdentity(organizationId: string, userId: string, fallbackName: string) {
  const [professional] = await db.select({ id: professionals.id, name: professionals.name, customProfession: professionals.customProfession, profession: professions.name }).from(professionals).leftJoin(professions, eq(professions.id, professionals.professionId)).where(and(eq(professionals.organizationId, organizationId), eq(professionals.userId, userId))).limit(1);
  if (!professional) return { name: fallbackName, subtitle: "" };
  const registrations = await db.select({ council: professionalRegistrations.council, state: professionalRegistrations.state, number: professionalRegistrations.registrationNumber }).from(professionalRegistrations).where(and(eq(professionalRegistrations.organizationId, organizationId), eq(professionalRegistrations.professionalId, professional.id))).orderBy(professionalRegistrations.createdAt);
  const credentials = registrations.map(item => `${item.council}${item.state ? `/${item.state}` : ""} ${item.number}`).join(" · ");
  return { name: professional.name, subtitle: [professional.customProfession || professional.profession, credentials].filter(Boolean).join(" — ") };
}
