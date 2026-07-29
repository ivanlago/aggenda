"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  appointments,
  clients,
  professionalRegistrations,
  professionalSpecialties,
  organizationMembers,
  organizationSubscriptions,
  organizations,
  professionals,
  services,
  specialties,
} from "@/db/schema";
import { requireOrganization, requireSession } from "@/lib/session";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return textValue(formData, key) || null;
}

function optionalInteger(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value ? Number.parseInt(value, 10) : null;
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
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
  });

  redirect("/dashboard");
}

export async function createProfessional(formData: FormData) {
  const { organization } = await requireOrganization();
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
  if (!["owner", "admin"].includes(organization.role)) {
    throw new Error("Você não tem permissão para alterar a organização.");
  }

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

export async function createClient(formData: FormData) {
  const { organization } = await requireOrganization();
  const name = textValue(formData, "name");
  if (name.length < 2) throw new Error("Informe o nome do cliente.");

  await db.insert(clients).values({
    organizationId: organization.id,
    name,
    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    notes: optionalText(formData, "notes"),
  });
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

export async function deleteClient(formData: FormData) {
  const { organization } = await requireOrganization();
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

export async function createService(formData: FormData) {
  const { organization } = await requireOrganization();
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
    priceInCents: optionalInteger(formData, "priceInCents"),
  });
  revalidatePath("/servicos");
  revalidatePath("/dashboard");
}

export async function deleteService(formData: FormData) {
  const { organization } = await requireOrganization();
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

export async function createAppointment(formData: FormData) {
  const { organization } = await requireOrganization();
  const serviceId = textValue(formData, "serviceId");
  const clientId = textValue(formData, "clientId");
  const professionalId = optionalText(formData, "professionalId");
  const startsAt = new Date(textValue(formData, "startsAt"));

  const [service] = await db
    .select({ durationMinutes: services.durationMinutes })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.organizationId, organization.id)))
    .limit(1);
  if (!service || !clientId || Number.isNaN(startsAt.getTime())) {
    throw new Error("Preencha cliente, serviço e horário.");
  }

  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  await db.insert(appointments).values({
    organizationId: organization.id,
    clientId,
    serviceId,
    professionalId,
    startsAt,
    endsAt,
    priceInCents: optionalInteger(formData, "priceInCents"),
    notes: optionalText(formData, "notes"),
  });
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
}

export async function updateAppointmentStatus(formData: FormData) {
  const { organization } = await requireOrganization();
  const status = textValue(formData, "status") as
    | "scheduled"
    | "confirmed"
    | "cancelled"
    | "completed"
    | "no_show";

  if (!["scheduled", "confirmed", "cancelled", "completed", "no_show"].includes(status)) {
    throw new Error("Status inválido.");
  }

  await db
    .update(appointments)
    .set({
      status,
      confirmedAt: status === "confirmed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(appointments.id, textValue(formData, "id")),
        eq(appointments.organizationId, organization.id)
      )
    );
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
}
