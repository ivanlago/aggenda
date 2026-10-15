import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, clients, professionals, professionalRegistrations } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";

export async function requireClinicalClient(clientId: string, write = false) {
  const context = await requireOrganization();
  const { organization, session } = context;
  assertOrganizationPermission(organization.role, write ? "clinical.manage" : "clinical.read");
  const [client] = await db.select({ id: clients.id }).from(clients).where(and(
    eq(clients.organizationId, organization.id), eq(clients.id, clientId),
  )).limit(1);
  if (!client) throw new Error("Paciente não encontrado ou sem acesso.");
  if (organization.role === "professional") {
    const professionalId = await requireProfessionalScope(organization.id, session.user.id);
    const [related] = await db.select({ id: appointments.id }).from(appointments).where(and(
      eq(appointments.organizationId, organization.id), eq(appointments.clientId, clientId), eq(appointments.professionalId, professionalId),
    )).limit(1);
    if (!related) throw new Error("Paciente não encontrado ou sem acesso.");
  }
  return context;
}

export async function assertClinicalIssuer(organizationId: string, userId: string, professionalId: string) {
  const [professional] = await db.select({ id: professionals.id }).from(professionals).where(and(
    eq(professionals.organizationId, organizationId), eq(professionals.id, professionalId),
    eq(professionals.userId, userId), eq(professionals.isActive, true),
  )).limit(1);
  if (!professional) throw new Error("A emissão clínica exige o profissional responsável vinculado ao usuário.");
}

/** Initial product scope: medical forms require a CRM registered for the issuer.
 * This checks the clinic's registration data, not current licensure with a council. */
export async function assertMedicalRegistration(organizationId: string, professionalId: string) {
  const [registration] = await db.select({ number: professionalRegistrations.registrationNumber, state: professionalRegistrations.state }).from(professionalRegistrations).where(and(
    eq(professionalRegistrations.organizationId, organizationId), eq(professionalRegistrations.professionalId, professionalId), eq(professionalRegistrations.council, "CRM"),
  )).limit(1);
  if (!registration?.number?.trim() || !/^[A-Z]{2}$/.test(registration.state ?? "")) throw new Error("Cadastre o CRM e a UF do médico responsável antes de utilizar este formulário médico.");
}
