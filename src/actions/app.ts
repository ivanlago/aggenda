"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  appointments,
  clients,
  organizationMembers,
  organizationSubscriptions,
  organizations,
  professionals,
  services,
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

  await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({
        name,
        slug,
        businessType: optionalText(formData, "businessType"),
        phone: optionalText(formData, "phone"),
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

  await db.insert(professionals).values({
    organizationId: organization.id,
    name,
    title: optionalText(formData, "title"),
    email: optionalText(formData, "email"),
    phone: optionalText(formData, "phone"),
    color: textValue(formData, "color") || "#18664a",
  });
  revalidatePath("/profissionais");
  revalidatePath("/dashboard");
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
