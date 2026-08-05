"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  appointments,
  clients,
  clientHistoryEntries,
  professionalRegistrations,
  professionalGoogleCalendarAccounts,
  professionalSpecialties,
  organizationMembers,
  organizationSubscriptions,
  organizations,
  professionals,
  services,
  specialties,
} from "@/db/schema";
import { requireOrganization, requireSession } from "@/lib/session";
import { isTimeAvailable } from "@/lib/availability";
import { organizationDate, parseOrganizationDateTime, withAppointmentLock } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";
import { assertOrganizationPermission } from "@/lib/permissions";
import {
  deleteAppointmentFromGoogleCalendar,
  syncAppointmentToGoogleCalendar,
} from "@/lib/google-calendar";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return textValue(formData, key) || null;
}

function optionalMoneyInCents(formData: FormData, key: string) {
  const raw = textValue(formData, key).replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um preço válido.");
  return Math.round(amount * 100);
}

export async function createOrganization(formData: FormData) {
  const session = await requireSession();
  const existing = await db
    .select({ id: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, session.user.id))
    .limit(1);

  if (existing.length) redirect("/dashboard");

  const name = textValue(formData, "name");
  if (name.length < 2) throw new Error("Informe o nome do negócio.");

  const baseSlug =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "negocio";
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
  const businessType = optionalText(formData, "businessType");
  const terminology =
    businessType === "saude"
      ? {
          clientLabel: "Paciente",
          clientLabelPlural: "Pacientes",
          professionalLabel: "Profissional",
          professionalLabelPlural: "Profissionais",
          serviceLabel: "Procedimento",
          serviceLabelPlural: "Procedimentos",
          appointmentLabel: "Consulta",
          appointmentLabelPlural: "Consultas",
        }
      : businessType === "juridico"
        ? {
            clientLabel: "Cliente",
            clientLabelPlural: "Clientes",
            professionalLabel: "Advogado",
            professionalLabelPlural: "Advogados",
            serviceLabel: "Serviço",
            serviceLabelPlural: "Serviços",
            appointmentLabel: "Reunião",
            appointmentLabelPlural: "Reuniões",
          }
        : {
            clientLabel: "Cliente",
            clientLabelPlural: "Clientes",
            professionalLabel: "Profissional",
            professionalLabelPlural: "Profissionais",
            serviceLabel: "Serviço",
            serviceLabelPlural: "Serviços",
            appointmentLabel: "Agendamento",
            appointmentLabelPlural: "Agendamentos",
          };

  await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({
        name,
        slug,
        businessType,
        phone: optionalText(formData, "phone"),
        ...terminology,
      })
      .returning({ id: organizations.id });

    await tx.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: session.user.id,
      role: "owner",
    });

    await tx.insert(organizationSubscriptions).values({
      organizationId: organization.id,
      plan: "trial",
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  });

  const requestedNext = textValue(formData, "next");
  redirect(requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard");
}

export async function createProfessional(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "professionals.manage");
  const name = textValue(formData, "name");
  if (name.length < 2) throw new Error("Informe o nome do profissional.");

  const professionId = optionalText(formData, "professionId");
  const specialtyIds = [
    ...new Set(formData.getAll("specialtyIds").map(String).filter(Boolean)),
  ];
  const council = optionalText(formData, "council");
  const registrationNumber = optionalText(formData, "registrationNumber");

  if ((council && !registrationNumber) || (!council && registrationNumber)) {
    throw new Error("Informe o conselho e o número do registro.");
  }
  if (
    professionId === "other" &&
    !optionalText(formData, "customProfession")
  ) {
    throw new Error("Informe a profissão personalizada.");
  }

  if (specialtyIds.length) {
    if (!professionId || professionId === "other") {
      throw new Error("Selecione a profissão correspondente às especialidades.");
    }
    const validSpecialties = await db
      .select({ id: specialties.id })
      .from(specialties)
      .where(
        and(
          inArray(specialties.id, specialtyIds),
          eq(specialties.professionId, professionId),
          eq(specialties.isActive, true)
        )
      );
    if (validSpecialties.length !== specialtyIds.length) {
      throw new Error("Uma ou mais especialidades não pertencem à profissão.");
    }
  }

  await db.transaction(async (tx) => {
    const [professional] = await tx
      .insert(professionals)
      .values({
        organizationId: organization.id,
        name,
        professionId: professionId === "other" ? null : professionId,
        customProfession: optionalText(formData, "customProfession"),
        honorificId: optionalText(formData, "honorificId"),
        customHonorific: optionalText(formData, "customHonorific"),
        title: optionalText(formData, "title"),
        bio: optionalText(formData, "bio"),
        email: optionalText(formData, "email"),
        phone: optionalText(formData, "phone"),
        color: textValue(formData, "color") || "#18664a",
        isBookable: formData.get("isBookable") === "on",
      })
      .returning({ id: professionals.id });

    if (specialtyIds.length) {
      await tx.insert(professionalSpecialties).values(
        specialtyIds.map((specialtyId) => ({
          professionalId: professional.id,
          specialtyId,
          organizationId: organization.id,
        }))
      );
    }

    if (council && registrationNumber) {
      await tx.insert(professionalRegistrations).values({
        professionalId: professional.id,
        organizationId: organization.id,
        council,
        registrationNumber,
        state: optionalText(formData, "registrationState")?.toUpperCase(),
      });
    }
  });
  revalidatePath("/profissionais");
  revalidatePath("/dashboard");
}

export async function addProfessionalRegistration(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "professionals.manage");
  const professionalId = textValue(formData, "professionalId");
  const council = textValue(formData, "council").toUpperCase();
  const registrationNumber = textValue(formData, "registrationNumber");
  const state = optionalText(formData, "registrationState")?.toUpperCase();
  if (!council || !registrationNumber) {
    throw new Error("Informe o conselho e o número do registro.");
  }

  const [professional] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.organizationId, organization.id)
      )
    )
    .limit(1);
  if (!professional) throw new Error("Profissional não encontrado.");

  await db.insert(professionalRegistrations).values({
    professionalId,
    organizationId: organization.id,
    council,
    registrationNumber,
    state,
  });
  revalidatePath("/profissionais");
}

export async function deleteProfessionalRegistration(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "professionals.manage");
  await db
    .delete(professionalRegistrations)
    .where(
      and(
        eq(professionalRegistrations.id, textValue(formData, "registrationId")),
        eq(professionalRegistrations.organizationId, organization.id)
      )
    );
  revalidatePath("/profissionais");
}

export async function updateOrganizationTerminology(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "organization.settings.manage");

  const labels = {
    clientLabel: textValue(formData, "clientLabel"),
    clientLabelPlural: textValue(formData, "clientLabelPlural"),
    professionalLabel: textValue(formData, "professionalLabel"),
    professionalLabelPlural: textValue(formData, "professionalLabelPlural"),
    serviceLabel: textValue(formData, "serviceLabel"),
    serviceLabelPlural: textValue(formData, "serviceLabelPlural"),
    appointmentLabel: textValue(formData, "appointmentLabel"),
    appointmentLabelPlural: textValue(formData, "appointmentLabelPlural"),
  };
  if (Object.values(labels).some((label) => label.length < 2 || label.length > 30)) {
    throw new Error("Os termos devem ter entre 2 e 30 caracteres.");
  }

  await db
    .update(organizations)
    .set({ ...labels, updatedAt: new Date() })
    .where(eq(organizations.id, organization.id));
  revalidatePath("/", "layout");
}

export async function deleteProfessional(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "professionals.manage");
  await db
    .delete(professionals)
    .where(
      and(
        eq(professionals.id, textValue(formData, "id")),
        eq(professionals.organizationId, organization.id)
      )
    );
  revalidatePath("/profissionais");
  revalidatePath("/dashboard");
}

export async function disconnectProfessionalGoogleCalendar(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "professionals.manage");
  const professionalId = textValue(formData, "professionalId");
  await db
    .delete(professionalGoogleCalendarAccounts)
    .where(
      and(
        eq(professionalGoogleCalendarAccounts.professionalId, professionalId),
        eq(professionalGoogleCalendarAccounts.organizationId, organization.id)
      )
    );
  revalidatePath("/profissionais");
}

export async function updateProfessional(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "professionals.manage");
  const id = textValue(formData, "id");
  const name = textValue(formData, "name");
  const professionId = optionalText(formData, "professionId");
  const specialtyIds = [...new Set(formData.getAll("specialtyIds").map(String).filter(Boolean))];
  if (!id || name.length < 2) throw new Error("Informe o nome do profissional.");
  if (professionId === "other" && !optionalText(formData, "customProfession")) {
    throw new Error("Informe a profissão personalizada.");
  }
  if (specialtyIds.length) {
    if (!professionId || professionId === "other") throw new Error("Selecione a profissão correspondente às especialidades.");
    const valid = await db.select({ id: specialties.id }).from(specialties).where(and(
      inArray(specialties.id, specialtyIds), eq(specialties.professionId, professionId), eq(specialties.isActive, true)
    ));
    if (valid.length !== specialtyIds.length) throw new Error("Uma ou mais especialidades não pertencem à profissão.");
  }
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(professionals).set({
      name,
      professionId: professionId === "other" ? null : professionId,
      customProfession: optionalText(formData, "customProfession"),
      honorificId: optionalText(formData, "honorificId"),
      customHonorific: optionalText(formData, "customHonorific"),
      title: optionalText(formData, "title"),
      bio: optionalText(formData, "bio"),
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      color: textValue(formData, "color") || "#18664a",
      isBookable: formData.get("isBookable") === "on",
      isActive: formData.get("isActive") === "on",
      updatedAt: new Date(),
    }).where(and(eq(professionals.id, id), eq(professionals.organizationId, organization.id))).returning({ id: professionals.id });
    if (!updated) throw new Error("Profissional não encontrado.");
    await tx.delete(professionalSpecialties).where(and(
      eq(professionalSpecialties.professionalId, id),
      eq(professionalSpecialties.organizationId, organization.id)
    ));
    if (specialtyIds.length) await tx.insert(professionalSpecialties).values(
      specialtyIds.map((specialtyId) => ({ professionalId: id, specialtyId, organizationId: organization.id }))
    );
  });
  revalidatePath("/profissionais");
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
}

export async function createClient(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const name = textValue(formData, "name");
  if (name.length < 2) throw new Error("Informe o nome do cliente.");

  await db.insert(clients).values({
    organizationId: organization.id,
    name,
    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    birthDate: optionalText(formData, "birthDate"),
    gender: optionalText(formData, "gender"),
    notes: optionalText(formData, "notes"),
  });
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

export async function deleteClient(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  await db
    .delete(clients)
    .where(
      and(
        eq(clients.id, textValue(formData, "id")),
        eq(clients.organizationId, organization.id)
      )
    );
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

export async function updateClient(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const id = textValue(formData, "id");
  const name = textValue(formData, "name");
  if (!id || name.length < 2) throw new Error("Informe o nome do cliente.");
  const [updated] = await db.update(clients).set({
    name,
    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    birthDate: optionalText(formData, "birthDate"),
    gender: optionalText(formData, "gender"),
    notes: optionalText(formData, "notes"),
    updatedAt: new Date(),
  }).where(and(eq(clients.id, id), eq(clients.organizationId, organization.id))).returning({ id: clients.id });
  if (!updated) throw new Error("Cliente não encontrado.");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/dashboard");
}

export async function createClientHistoryEntry(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const clientId = textValue(formData, "clientId");
  const content = textValue(formData, "content");
  if (!clientId || content.length < 2) throw new Error("Informe o conteúdo do registro.");
  const [client] = await db.select({ id: clients.id }).from(clients).where(and(
    eq(clients.id, clientId), eq(clients.organizationId, organization.id)
  )).limit(1);
  if (!client) throw new Error("Cliente não encontrado.");
  const occurredAtRaw = optionalText(formData, "occurredAt");
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("Data do registro inválida.");
  const [entry] = await db.insert(clientHistoryEntries).values({
    organizationId: organization.id,
    clientId,
    authorUserId: session.user.id,
    entryType: textValue(formData, "entryType") || "note",
    title: optionalText(formData, "title"),
    content,
    occurredAt,
  }).returning({ id: clientHistoryEntries.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "client_history_entry", entityId: entry.id });
  revalidatePath(`/clientes/${clientId}`);
}

export async function createService(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const name = textValue(formData, "name");
  const durationMinutes = Number.parseInt(textValue(formData, "durationMinutes"), 10);
  if (name.length < 2 || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Informe nome e duração válidos.");
  }

  await db.insert(services).values({
    organizationId: organization.id,
    name,
    description: optionalText(formData, "description"),
    durationMinutes,
    priceInCents: optionalMoneyInCents(formData, "price"),
  });
  revalidatePath("/servicos");
  revalidatePath("/dashboard");
}

export async function deleteService(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  await db
    .delete(services)
    .where(
      and(
        eq(services.id, textValue(formData, "id")),
        eq(services.organizationId, organization.id)
      )
    );
  revalidatePath("/servicos");
  revalidatePath("/dashboard");
}

export async function updateService(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const id = textValue(formData, "id");
  const name = textValue(formData, "name");
  const durationMinutes = Number.parseInt(textValue(formData, "durationMinutes"), 10);
  if (!id || name.length < 2 || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Informe nome e duração válidos.");
  }
  await db.update(services).set({
    name, description: optionalText(formData, "description"), durationMinutes,
    priceInCents: optionalMoneyInCents(formData, "price"),
    isActive: formData.get("isActive") === "on", updatedAt: new Date(),
  }).where(and(eq(services.id, id), eq(services.organizationId, organization.id)));
  revalidatePath("/servicos");
  revalidatePath("/dashboard");
}

export async function createAppointment(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "appointments.manage");
  const serviceId = textValue(formData, "serviceId");
  const clientId = textValue(formData, "clientId");
  const professionalId = optionalText(formData, "professionalId");
  const startsAt = parseOrganizationDateTime(textValue(formData, "startsAt"), organization.timezone);

  const [service] = await db
    .select({
      durationMinutes: services.durationMinutes,
      requiresProfessional: services.requiresProfessional,
      priceInCents: services.priceInCents,
    })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.organizationId, organization.id)))
    .limit(1);
  if (!service || !clientId || Number.isNaN(startsAt.getTime())) {
    throw new Error("Preencha cliente, serviço e horário.");
  }
  if (service.requiresProfessional && !professionalId) {
    throw new Error("Selecione um profissional para este serviço.");
  }
  const [[client], professional] = await Promise.all([
    db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.id, clientId),
          eq(clients.organizationId, organization.id)
        )
      )
      .limit(1),
    professionalId
      ? db
          .select({ id: professionals.id })
          .from(professionals)
          .where(
            and(
              eq(professionals.id, professionalId),
              eq(professionals.organizationId, organization.id),
              eq(professionals.isActive, true),
              eq(professionals.isBookable, true)
            )
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (!client || (professionalId && !professional.length)) {
    throw new Error("Cliente ou profissional inválido.");
  }
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  const created = await withAppointmentLock(organization.id, professionalId, async (tx) => {
    if (professionalId) {
      const available = await isTimeAvailable({
        organizationId: organization.id, timezone: organization.timezone,
        date: organizationDate(startsAt, organization.timezone), serviceId, professionalId,
        slotIntervalMinutes: organization.slotIntervalMinutes, startsAt,
      });
      if (!available) throw new Error("O horário selecionado não está disponível.");
    }
    const [result] = await tx.insert(appointments).values({
      organizationId: organization.id, clientId, serviceId, professionalId, startsAt, endsAt,
      priceInCents: optionalMoneyInCents(formData, "price") ?? service.priceInCents,
      notes: optionalText(formData, "notes"),
    }).returning({ id: appointments.id });
    return result;
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "create",
    entityType: "appointment",
    entityId: created.id,
  });
  await syncAppointmentToGoogleCalendar(created.id);
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
}

export async function updateAppointmentStatus(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "appointments.manage");
  const status = textValue(formData, "status") as
    | "scheduled"
    | "confirmed"
    | "cancelled"
    | "completed"
    | "no_show";

  if (!["scheduled", "confirmed", "cancelled", "completed", "no_show"].includes(status)) {
    throw new Error("Status inválido.");
  }
  const cancellationReason = optionalText(formData, "cancellationReason");
  if (status === "cancelled" && !cancellationReason) {
    throw new Error("Informe o motivo do cancelamento.");
  }

  const appointmentId = textValue(formData, "id");
  await db
    .update(appointments)
    .set({
      status,
      confirmedAt: status === "confirmed" ? new Date() : undefined,
      cancellationReason: status === "cancelled" ? cancellationReason : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.organizationId, organization.id)
      )
    );
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: `status:${status}`,
    entityType: "appointment",
    entityId: appointmentId,
    details: cancellationReason ? { cancellationReason } : {},
  });
  if (status === "cancelled") {
    await deleteAppointmentFromGoogleCalendar(appointmentId);
  } else {
    await syncAppointmentToGoogleCalendar(appointmentId);
  }
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
}
