"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  appointments,
  clients,
  crmPipelines,
  crmStages,
  clientPackageBalances,
  clientPackages,
  financialEntries,
  financialAccounts,
  financialCategories,
  financialCostCenters,
  financialBudgets,
  clientHistoryEntries,
  clientClinicalMedia,
  professionalRegistrations,
  professionalGoogleCalendarAccounts,
  professionalSpecialties,
  organizationMembers,
  organizationSubscriptions,
  organizations,
  professionals,
  servicePackageItems,
  servicePackages,
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
import { deleteClinicalImage, uploadClinicalImage } from "@/lib/cloudinary";
import { reconcilePackageUsage, reservePackageSession } from "@/lib/package-balance";
import {
  createClientPackageFinancialEntry,
  syncAppointmentFinancialEntry,
} from "@/lib/finance";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";
import { updateAppointmentAndInventory } from "@/lib/inventory";

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

    const [pipeline] = await tx.insert(crmPipelines).values({
      organizationId: organization.id,
      name: "Funil comercial",
      isDefault: true,
    }).returning({ id: crmPipelines.id });
    await tx.insert(crmStages).values([
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Novo contato", position: 1, probability: 10 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Qualificado", position: 2, probability: 30 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Demonstração", position: 3, probability: 50 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Proposta", position: 4, probability: 70 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Negociação", position: 5, probability: 85 },
    ]);
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

export async function createClientClinicalMedia(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const clientId = textValue(formData, "clientId");
  const file = formData.get("file");
  if (!clientId || !(file instanceof File) || file.size === 0 || formData.get("consentConfirmed") !== "on") {
    throw new Error("Selecione uma imagem e confirme o consentimento do paciente.");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 12 MB.");
  const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1);
  if (!client) throw new Error("Cliente não encontrado.");
  const parentMediaId = optionalText(formData, "parentMediaId");
  if (parentMediaId) {
    const [parent] = await db.select({ id: clientClinicalMedia.id }).from(clientClinicalMedia).where(and(
      eq(clientClinicalMedia.id, parentMediaId),
      eq(clientClinicalMedia.clientId, clientId),
      eq(clientClinicalMedia.organizationId, organization.id),
    )).limit(1);
    if (!parent) throw new Error("Fotografia original não encontrada.");
  }
  const uploaded = await uploadClinicalImage(file, organization.id, clientId);
  try {
    const [media] = await db.insert(clientClinicalMedia).values({
      organizationId: organization.id,
      clientId,
      authorUserId: session.user.id,
      phase: textValue(formData, "phase") || "clinical",
      title: optionalText(formData, "title"),
      url: "cloudinary:authenticated",
      consentConfirmed: true,
      storageProvider: "cloudinary",
      storageAssetId: uploaded.assetId,
      storagePublicId: uploaded.publicId,
      originalFilename: file.name,
      mimeType: file.type,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      parentMediaId,
    }).returning({ id: clientClinicalMedia.id });
    await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "client_clinical_media", entityId: media.id });
  } catch (error) {
    await deleteClinicalImage(uploaded.publicId).catch(() => undefined);
    throw error;
  }
  revalidatePath(`/clientes/${clientId}`);
}

export async function deleteClientClinicalMedia(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const mediaId = textValue(formData, "mediaId");
  const [media] = await db.select().from(clientClinicalMedia).where(and(
    eq(clientClinicalMedia.id, mediaId),
    eq(clientClinicalMedia.organizationId, organization.id),
  )).limit(1);
  if (!media) throw new Error("Fotografia não encontrada.");
  if (media.storageProvider === "cloudinary" && media.storagePublicId) await deleteClinicalImage(media.storagePublicId);
  await db.delete(clientClinicalMedia).where(and(
    eq(clientClinicalMedia.id, media.id),
    eq(clientClinicalMedia.organizationId, organization.id),
  ));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "delete", entityType: "client_clinical_media", entityId: media.id });
  revalidatePath(`/clientes/${media.clientId}`);
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
    estimatedCostInCents: optionalMoneyInCents(formData, "estimatedCost") ?? 0,
    depositType: ["none", "fixed", "percentage", "full"].includes(textValue(formData, "depositType")) ? textValue(formData, "depositType") : "none",
    depositValue: Number.parseInt(textValue(formData, "depositValue") || "0", 10) || 0,
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
    estimatedCostInCents: optionalMoneyInCents(formData, "estimatedCost") ?? 0,
    depositType: ["none", "fixed", "percentage", "full"].includes(textValue(formData, "depositType")) ? textValue(formData, "depositType") : "none",
    depositValue: Number.parseInt(textValue(formData, "depositValue") || "0", 10) || 0,
    isActive: formData.get("isActive") === "on", updatedAt: new Date(),
  }).where(and(eq(services.id, id), eq(services.organizationId, organization.id)));
  revalidatePath("/servicos");
  revalidatePath("/dashboard");
}

export async function createServicePackage(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const name = textValue(formData, "name");
  const priceInCents = optionalMoneyInCents(formData, "price");
  const validityRaw = optionalText(formData, "validityDays");
  const validityDays = validityRaw ? Number.parseInt(validityRaw, 10) : null;
  const selectedItems = [...formData.entries()]
    .filter(([key]) => key.startsWith("quantity:"))
    .map(([key, value]) => ({
      serviceId: key.slice("quantity:".length),
      quantity: Number.parseInt(String(value), 10),
    }))
    .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
  if (name.length < 2 || priceInCents == null || !selectedItems.length) {
    throw new Error("Informe nome, preço e ao menos um serviço com quantidade.");
  }
  if (validityDays != null && (!Number.isInteger(validityDays) || validityDays <= 0)) {
    throw new Error("Informe uma validade em dias maior que zero.");
  }
  const validServices = await db
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.organizationId, organization.id),
        inArray(services.id, selectedItems.map((item) => item.serviceId))
      )
    );
  if (validServices.length !== selectedItems.length) {
    throw new Error("Um ou mais serviços do pacote são inválidos.");
  }
  await db.transaction(async (tx) => {
    const [created] = await tx.insert(servicePackages).values({
      organizationId: organization.id,
      name,
      description: optionalText(formData, "description"),
      priceInCents,
      validityDays,
    }).returning({ id: servicePackages.id });
    await tx.insert(servicePackageItems).values(selectedItems.map((item) => ({
      organizationId: organization.id,
      packageId: created.id,
      serviceId: item.serviceId,
      quantity: item.quantity,
    })));
  });
  revalidatePath("/pacotes");
}

export async function toggleServicePackage(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  await db.update(servicePackages).set({
    isActive: formData.get("isActive") === "true",
    updatedAt: new Date(),
  }).where(and(
    eq(servicePackages.id, textValue(formData, "id")),
    eq(servicePackages.organizationId, organization.id)
  ));
  revalidatePath("/pacotes");
}

export async function assignPackageToClient(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const clientId = textValue(formData, "clientId");
  const packageId = textValue(formData, "packageId");
  const [[client], [template], items] = await Promise.all([
    db.select({ id: clients.id }).from(clients).where(and(
      eq(clients.id, clientId), eq(clients.organizationId, organization.id)
    )).limit(1),
    db.select().from(servicePackages).where(and(
      eq(servicePackages.id, packageId),
      eq(servicePackages.organizationId, organization.id),
      eq(servicePackages.isActive, true)
    )).limit(1),
    db.select().from(servicePackageItems).where(and(
      eq(servicePackageItems.packageId, packageId),
      eq(servicePackageItems.organizationId, organization.id)
    )),
  ]);
  if (!client || !template || !items.length) throw new Error("Cliente ou pacote inválido.");
  const purchasedAt = new Date();
  const expiresAt = template.validityDays
    ? new Date(purchasedAt.getTime() + template.validityDays * 86_400_000)
    : null;
  const priceInCents = optionalMoneyInCents(formData, "price") ?? template.priceInCents;
  const [assigned] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(clientPackages).values({
      organizationId: organization.id,
      clientId,
      packageId,
      priceInCents,
      purchasedAt,
      expiresAt,
      notes: optionalText(formData, "notes"),
    }).returning({ id: clientPackages.id });
    await tx.insert(clientPackageBalances).values(items.map((item) => ({
      organizationId: organization.id,
      clientPackageId: created.id,
      serviceId: item.serviceId,
      totalQuantity: item.quantity,
    })));
    return [created];
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "assign",
    entityType: "client_package",
    entityId: assigned.id,
    details: { clientId, packageId, priceInCents },
  });
  const dueDate = optionalText(formData, "dueDate") ?? organizationDate(new Date(), organization.timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Data de vencimento inválida.");
  await createClientPackageFinancialEntry({
    clientPackageId: assigned.id,
    dueDate,
    received: formData.get("received") === "on",
    paymentMethod: optionalText(formData, "paymentMethod"),
  });
  revalidatePath("/pacotes");
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/financeiro");
}

export async function createFinancialEntry(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const type = textValue(formData, "type");
  const description = textValue(formData, "description");
  const amountInCents = optionalMoneyInCents(formData, "amount");
  const dueDate = textValue(formData, "dueDate");
  const realized = formData.get("realized") === "on";
  const installmentCount = Math.min(60, Math.max(1, Math.trunc(Number(textValue(formData, "installmentCount") || "1"))));
  const recurrenceMonths = Math.min(60, Math.max(1, Math.trunc(Number(textValue(formData, "recurrenceMonths") || "1"))));
  if (installmentCount > 1 && recurrenceMonths > 1) throw new Error("Escolha parcelamento ou recorrência, não os dois ao mesmo tempo.");
  if (!['payable', 'receivable'].includes(type) || description.length < 2 || !amountInCents || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error("Informe tipo, descrição, valor e vencimento válidos.");
  }
  const accountId = optionalText(formData, "accountId"); const categoryId = optionalText(formData, "categoryId"); const costCenterId = optionalText(formData, "costCenterId");
  const [account, category, costCenter] = await Promise.all([
    accountId ? db.select({ id: financialAccounts.id }).from(financialAccounts).where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.organizationId, organization.id))).limit(1) : [],
    categoryId ? db.select({ id: financialCategories.id, name: financialCategories.name }).from(financialCategories).where(and(eq(financialCategories.id, categoryId), eq(financialCategories.organizationId, organization.id), eq(financialCategories.type, type))).limit(1) : [],
    costCenterId ? db.select({ id: financialCostCenters.id }).from(financialCostCenters).where(and(eq(financialCostCenters.id, costCenterId), eq(financialCostCenters.organizationId, organization.id))).limit(1) : [],
  ]);
  if ((accountId && !account.length) || (categoryId && !category.length) || (costCenterId && !costCenter.length)) throw new Error("Conta, categoria ou centro de custo inválido.");
  const totalEntries = Math.max(installmentCount, recurrenceMonths); const groupId = totalEntries > 1 ? crypto.randomUUID() : null;
  const baseDate = new Date(`${dueDate}T12:00:00Z`);
  const values = Array.from({ length: totalEntries }, (_, index) => {
    const next = new Date(baseDate); next.setUTCMonth(next.getUTCMonth() + index);
    const entryAmount = installmentCount > 1 ? Math.floor(amountInCents / installmentCount) + (index < amountInCents % installmentCount ? 1 : 0) : amountInCents;
    return { organizationId: organization.id, type, status: realized && index === 0 ? (type === "payable" ? "paid" : "received") : "pending", source: recurrenceMonths > 1 ? "recurring" : installmentCount > 1 ? "installment" : "manual", description: totalEntries > 1 ? `${description} (${index + 1}/${totalEntries})` : description, category: category[0]?.name ?? optionalText(formData, "category"), categoryId, accountId, costCenterId, amountInCents: entryAmount, dueDate: next.toISOString().slice(0, 10), realizedDate: realized && index === 0 ? (optionalText(formData, "realizedDate") ?? dueDate) : null, paymentMethod: optionalText(formData, "paymentMethod"), notes: optionalText(formData, "notes"), recurrenceGroupId: groupId, installmentNumber: index + 1, installmentCount: totalEntries, createdByUserId: session.user.id };
  });
  const [entry] = await db.insert(financialEntries).values(values).returning({ id: financialEntries.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "financial_entry", entityId: entry.id });
  revalidatePath("/financeiro");
}

export async function createFinancialAccount(formData: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const name = textValue(formData, "name"); const accountType = textValue(formData, "accountType");
  if (name.length < 2 || !["bank", "cash", "digital_wallet"].includes(accountType)) throw new Error("Informe nome e tipo da conta.");
  await db.insert(financialAccounts).values({ organizationId: organization.id, name, accountType, openingBalanceInCents: optionalMoneyInCents(formData, "openingBalance") ?? 0 }).onConflictDoNothing();
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "financial_account" }); revalidatePath("/financeiro");
}

export async function createFinancialCategory(formData: FormData) {
  const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const name = textValue(formData, "name"); const type = textValue(formData, "type");
  if (name.length < 2 || !["payable", "receivable"].includes(type)) throw new Error("Informe nome e tipo da categoria.");
  await db.insert(financialCategories).values({ organizationId: organization.id, name, type }).onConflictDoNothing(); revalidatePath("/financeiro");
}

export async function createFinancialCostCenter(formData: FormData) {
  const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const name = textValue(formData, "name"); if (name.length < 2) throw new Error("Informe o centro de custo.");
  await db.insert(financialCostCenters).values({ organizationId: organization.id, name }).onConflictDoNothing(); revalidatePath("/financeiro");
}

export async function upsertFinancialBudget(formData: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const categoryId = textValue(formData, "categoryId"); const costCenterId = optionalText(formData, "costCenterId"); const month = textValue(formData, "month"); const amountInCents = optionalMoneyInCents(formData, "amount");
  if (!categoryId || !/^\d{4}-\d{2}$/.test(month) || amountInCents == null) throw new Error("Informe categoria, mês e orçamento válidos.");
  const [category] = await db.select({ id: financialCategories.id }).from(financialCategories).where(and(eq(financialCategories.id, categoryId), eq(financialCategories.organizationId, organization.id))).limit(1);
  const center = costCenterId ? await db.select({ id: financialCostCenters.id }).from(financialCostCenters).where(and(eq(financialCostCenters.id, costCenterId), eq(financialCostCenters.organizationId, organization.id))).limit(1) : [];
  if (!category || (costCenterId && !center.length)) throw new Error("Categoria ou centro de custo inválido.");
  const [existing] = await db.select({ id: financialBudgets.id }).from(financialBudgets).where(and(eq(financialBudgets.organizationId, organization.id), eq(financialBudgets.categoryId, categoryId), costCenterId ? eq(financialBudgets.costCenterId, costCenterId) : isNull(financialBudgets.costCenterId), eq(financialBudgets.month, month))).limit(1);
  if (existing) await db.update(financialBudgets).set({ amountInCents, updatedAt: new Date() }).where(eq(financialBudgets.id, existing.id));
  else await db.insert(financialBudgets).values({ organizationId: organization.id, categoryId, costCenterId, month, amountInCents, createdByUserId: session.user.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "upsert", entityType: "financial_budget", details: { categoryId, costCenterId, month, amountInCents } }); revalidatePath("/financeiro/relatorios");
}

export async function updateFinancialEntryStatus(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const id = textValue(formData, "id");
  const requestedStatus = textValue(formData, "status");
  const [current] = await db.select({ type: financialEntries.type }).from(financialEntries).where(and(
    eq(financialEntries.id, id), eq(financialEntries.organizationId, organization.id)
  )).limit(1);
  if (!current) throw new Error("Lançamento financeiro não encontrado.");
  const status = requestedStatus === "realized"
    ? (current.type === "payable" ? "paid" : "received")
    : requestedStatus;
  if (!["pending", "paid", "received", "cancelled"].includes(status)) throw new Error("Status financeiro inválido.");
  const isRealized = status === "paid" || status === "received";
  await db.update(financialEntries).set({
    status,
    realizedDate: isRealized ? (optionalText(formData, "realizedDate") ?? organizationDate(new Date(), organization.timezone)) : null,
    paymentMethod: isRealized ? optionalText(formData, "paymentMethod") : null,
    updatedAt: new Date(),
  }).where(and(eq(financialEntries.id, id), eq(financialEntries.organizationId, organization.id)));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: `status:${status}`, entityType: "financial_entry", entityId: id });
  revalidatePath("/financeiro");
}

export async function deleteFinancialEntry(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const id = textValue(formData, "id");
  const [deleted] = await db.delete(financialEntries).where(and(
    eq(financialEntries.id, id),
    eq(financialEntries.organizationId, organization.id),
    inArray(financialEntries.source, ["manual", "installment", "recurring"])
  )).returning({ id: financialEntries.id });
  if (!deleted) throw new Error("Somente lançamentos criados manualmente podem ser excluídos.");
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "delete", entityType: "financial_entry", entityId: id });
  revalidatePath("/financeiro");
}

export async function createAppointment(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "appointments.manage");
  const serviceId = textValue(formData, "serviceId");
  const clientId = textValue(formData, "clientId");
  const professionalId = optionalText(formData, "professionalId");
  const clientPackageId = optionalText(formData, "clientPackageId");
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
  if (clientPackageId) {
    try {
      await reservePackageSession({
        appointmentId: created.id,
        organizationId: organization.id,
        clientId,
        serviceId,
        clientPackageId,
      });
      await db.update(appointments).set({ priceInCents: 0 }).where(eq(appointments.id, created.id));
    } catch (error) {
      await db.delete(appointments).where(eq(appointments.id, created.id));
      throw error;
    }
  }
  await syncAppointmentFinancialEntry(created.id);
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "create",
    entityType: "appointment",
    entityId: created.id,
  });
  await syncAppointmentToGoogleCalendar(created.id);
  try {
    await enqueueAppointmentNotification(created.id, "confirmation");
  } catch (error) {
    console.error("[create-appointment] Falha ao enfileirar confirmação no WhatsApp", error);
  }
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
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
    return { error: "Selecione um status válido." };
  }
  const cancellationReason = optionalText(formData, "cancellationReason");
  if (status === "cancelled" && !cancellationReason) {
    return { error: "Informe o motivo do cancelamento." };
  }

  const appointmentId = textValue(formData, "id");
  let updatedAppointment = false;
  try {
    updatedAppointment = await updateAppointmentAndInventory({ organizationId: organization.id, appointmentId, status, cancellationReason, userId: session.user.id });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível movimentar o estoque." };
  }
  if (!updatedAppointment) {
    return { error: "Agendamento não encontrado. Atualize a página e tente novamente." };
  }

  const followUpResults = await Promise.allSettled([
    writeAuditLog({
      organizationId: organization.id,
      userId: session.user.id,
      action: `status:${status}`,
      entityType: "appointment",
      entityId: appointmentId,
      details: cancellationReason ? { cancellationReason } : {},
    }),
    status === "cancelled"
      ? deleteAppointmentFromGoogleCalendar(appointmentId)
      : syncAppointmentToGoogleCalendar(appointmentId),
    reconcilePackageUsage(appointmentId, status),
    syncAppointmentFinancialEntry(appointmentId),
    ...(status === "cancelled" || status === "confirmed"
      ? [enqueueAppointmentNotification(
          appointmentId,
          status === "cancelled" ? "cancellation" : "confirmation",
        )]
      : []),
  ]);

  followUpResults.forEach((result, index) => {
    if (result.status === "rejected") {
      const operation = ["auditoria", "Google Agenda", "pacote", "financeiro", "WhatsApp"][index];
      console.error(`[update-appointment-status] Falha na sincronização de ${operation}`, result.reason);
    }
  });
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
}
