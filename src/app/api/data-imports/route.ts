import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { clients, dataImportRows, dataImports, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

const requestSchema = z.object({
  importId: z.string().uuid(),
  entityType: z.enum(["clients", "services"]),
  fileName: z.string().min(1).max(255),
  strategy: z.enum(["skip", "update"]),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
});

const text = (value: unknown) => String(value ?? "").trim();
const phone = (value: unknown) => text(value).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
const money = (value: unknown) => {
  const raw = text(value).replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = normalized ? Number(normalized) : null;
  return number == null || !Number.isFinite(number) || number < 0 ? null : Math.round(number * 100);
};
const truthy = (value: unknown, fallback: boolean) => {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  return ["sim", "s", "true", "1", "yes", "ativo"].includes(normalized);
};

export async function POST(request: Request) {
  try {
    const { session, organization } = await requireOrganization();
    const input = requestSchema.parse(await request.json());
    assertOrganizationPermission(organization.role, input.entityType === "clients" ? "clients.manage" : "services.manage");

    const [existingImport] = await db.select().from(dataImports)
      .where(and(eq(dataImports.id, input.importId), eq(dataImports.organizationId, organization.id))).limit(1);
    if (existingImport) return Response.json({ import: existingImport, results: [] });

    const results: Array<{ row: number; action: string; error?: string }> = [];
    let createdRows = 0, updatedRows = 0, skippedRows = 0, errorRows = 0;

    await db.transaction(async (tx) => {
      await tx.insert(dataImports).values({
        id: input.importId, organizationId: organization.id, userId: session.user.id,
        entityType: input.entityType, fileName: input.fileName, strategy: input.strategy,
        totalRows: input.rows.length,
      });

      const existingClients = input.entityType === "clients"
        ? await tx.select().from(clients).where(eq(clients.organizationId, organization.id)) : [];
      const existingServices = input.entityType === "services"
        ? await tx.select().from(services).where(eq(services.organizationId, organization.id)) : [];

      for (let index = 0; index < input.rows.length; index += 1) {
        const row = input.rows[index];
        const rowNumber = index + 2;
        try {
          if (input.entityType === "clients") {
            const name = text(row.name), normalizedPhone = phone(row.phone), email = text(row.email).toLowerCase() || null;
            const birthDate = text(row.birthDate) || null;
            const genderRaw = text(row.gender).toLowerCase();
            const genderMap: Record<string, string> = { feminino: "female", female: "female", masculino: "male", male: "male", outro: "other", other: "other", "prefere não informar": "not_informed", not_informed: "not_informed" };
            const gender = genderRaw ? genderMap[genderRaw] : null;
            if (name.length < 2) throw new Error("Nome não informado.");
            if (normalizedPhone && normalizedPhone.length < 10) throw new Error("Telefone inválido.");
            if (email && !z.string().email().safeParse(email).success) throw new Error("E-mail inválido.");
            if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("Data de nascimento deve estar em AAAA-MM-DD.");
            if (genderRaw && !gender) throw new Error("Sexo inválido.");
            const found = existingClients.find((item) =>
              (normalizedPhone && item.phone === normalizedPhone) || (email && item.email?.toLowerCase() === email));
            if (found && input.strategy === "skip") {
              skippedRows += 1; results.push({ row: rowNumber, action: "ignored" });
              await tx.insert(dataImportRows).values({ importId: input.importId, rowNumber, entityId: found.id, action: "ignored" });
              continue;
            }
            if (found) {
              await tx.update(clients).set({ name, phone: normalizedPhone || null, email, birthDate, gender, notes: text(row.notes) || null, updatedAt: new Date() }).where(eq(clients.id, found.id));
              updatedRows += 1; results.push({ row: rowNumber, action: "updated" });
              await tx.insert(dataImportRows).values({ importId: input.importId, rowNumber, entityId: found.id, action: "updated", previousData: found });
            } else {
              const [created] = await tx.insert(clients).values({ organizationId: organization.id, name, phone: normalizedPhone || null, email, birthDate, gender, notes: text(row.notes) || null }).returning({ id: clients.id });
              existingClients.push({ id: created.id, organizationId: organization.id, name, phone: normalizedPhone || null, email, birthDate, gender, notes: text(row.notes) || null, createdAt: new Date(), updatedAt: new Date() });
              createdRows += 1; results.push({ row: rowNumber, action: "created" });
              await tx.insert(dataImportRows).values({ importId: input.importId, rowNumber, entityId: created.id, action: "created" });
            }
          } else {
            const name = text(row.name), durationMinutes = Number.parseInt(text(row.durationMinutes), 10);
            if (name.length < 2) throw new Error("Nome não informado.");
            if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("Duração inválida.");
            const found = existingServices.find((item) => item.name.trim().toLowerCase() === name.toLowerCase());
            if (found && input.strategy === "skip") {
              skippedRows += 1; results.push({ row: rowNumber, action: "ignored" });
              await tx.insert(dataImportRows).values({ importId: input.importId, rowNumber, entityId: found.id, action: "ignored" });
              continue;
            }
            const values = { name, description: text(row.description) || null, durationMinutes, priceInCents: money(row.price), estimatedCostInCents: 0, depositType: "none", depositValue: 0, depositExpirationMinutes: 30, isActive: truthy(row.isActive, true), requiresProfessional: truthy(row.requiresProfessional, true), updatedAt: new Date() };
            if (found) {
              await tx.update(services).set(values).where(eq(services.id, found.id));
              updatedRows += 1; results.push({ row: rowNumber, action: "updated" });
              await tx.insert(dataImportRows).values({ importId: input.importId, rowNumber, entityId: found.id, action: "updated", previousData: found });
            } else {
              const [created] = await tx.insert(services).values({ organizationId: organization.id, ...values }).returning({ id: services.id });
              existingServices.push({ id: created.id, organizationId: organization.id, createdAt: new Date(), ...values });
              createdRows += 1; results.push({ row: rowNumber, action: "created" });
              await tx.insert(dataImportRows).values({ importId: input.importId, rowNumber, entityId: created.id, action: "created" });
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Linha inválida.";
          errorRows += 1; results.push({ row: rowNumber, action: "error", error: message });
          await tx.insert(dataImportRows).values({ importId: input.importId, rowNumber, action: "error", error: message });
        }
      }
      await tx.update(dataImports).set({ status: "completed", createdRows, updatedRows, skippedRows, errorRows, completedAt: new Date() }).where(eq(dataImports.id, input.importId));
    });
    await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "import", entityType: input.entityType, entityId: input.importId, details: { fileName: input.fileName, createdRows, updatedRows, skippedRows, errorRows } });
    return Response.json({ summary: { totalRows: input.rows.length, createdRows, updatedRows, skippedRows, errorRows }, results });
  } catch (error) {
    console.error("[data-import]", error);
    return Response.json({ error: error instanceof Error ? error.message : "Falha na importação." }, { status: 400 });
  }
}
