"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { clients, clientHistoryEntries, retailQuotes } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { requireAttendance } from "@/lib/attendance";
import { canManageQuotes } from "@/lib/retail-quotes";
import { hasOrganizationPermission } from "@/lib/permissions";
import { getPosProducts, getPosOfferings } from "@/lib/pos-catalog";
import { quoteItemsSchema, quoteTotals } from "@/lib/retail-quote-items";
import { organizationDate } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";

export async function saveRetailQuote(data: FormData) {
  const { organization, session } = await requireOrganization();
  const attendanceId = String(data.get("attendanceId") || "");
  const attendance = attendanceId ? await requireAttendance(attendanceId) : null;
  if (!canManageQuotes(organization.role) && !(attendance && (organization.role === "professional" || hasOrganizationPermission(organization.role, "documents.manage")))) return { error: "Sem permissão para criar orçamentos." };
  const parsed = z.object({ id: z.uuid(), validUntil: z.iso.date(), notes: z.string().trim().max(3000) }).safeParse(Object.fromEntries(data));
  let raw: unknown;
  try { raw = JSON.parse(String(data.get("items") || "[]")); } catch { return { error: "Itens inválidos." }; }
  const requested = quoteItemsSchema.safeParse(raw);
  if (!parsed.success || !requested.success) return { error: "Revise os itens, a validade e as observações." };
  if (parsed.data.validUntil < organizationDate(new Date(), organization.timezone)) return { error: "A validade não pode estar no passado." };
  if (requested.data.some((item) => item.discountInCents > 0) && !hasOrganizationPermission(organization.role, "sales.discount")) return { error: "Sem permissão para aplicar descontos." };
  const clientId = attendance?.appointment.clientId ?? (String(data.get("clientId") || "") || null);
  if (clientId && !z.uuid().safeParse(clientId).success) return { error: "Cliente inválido." };
  const [client] = clientId ? await db.select({ name: clients.name }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1) : [];
  if (clientId && !client) return { error: "Cliente não encontrado." };
  const catalog = (await Promise.all([getPosProducts(organization.id), getPosOfferings(organization.id)])).flat();
  const items = requested.data.map((item) => {
    const catalogItem = catalog.find((entry) => entry.id === item.variantId);
    if (!catalogItem || ("unavailableReason" in catalogItem && catalogItem.unavailableReason)) throw new Error("Item indisponível. Revise o catálogo.");
    return { ...item, label: catalogItem.label, kind: catalogItem.kind, unitPriceInCents: catalogItem.priceInCents };
  });
  const totals = quoteTotals(items);
  const id = await db.transaction(async (tx) => {
    const [quote] = await tx.insert(retailQuotes).values({ ...parsed.data, organizationId: organization.id, clientId, clientName: client?.name, attendanceId: attendanceId || null, createdByUserId: session.user.id, items, ...totals }).onConflictDoNothing({ target: retailQuotes.id }).returning({ id: retailQuotes.id });
    if (!quote) {
      const [existing] = await tx.select({ id: retailQuotes.id }).from(retailQuotes).where(and(eq(retailQuotes.id, parsed.data.id), eq(retailQuotes.organizationId, organization.id), eq(retailQuotes.createdByUserId, session.user.id)));
      if (!existing) throw new Error("Não foi possível salvar o orçamento.");
      return existing.id;
    }
    if (clientId) await tx.insert(clientHistoryEntries).values({ organizationId: organization.id, clientId, authorUserId: session.user.id, appointmentId: attendanceId || null, retailQuoteId: quote.id, entryType: "quote", title: `Orçamento #${quote.id.slice(0, 8)}`, content: items.map((item) => `${item.quantity} × ${item.label}`).join("\n") + `\nTotal: ${(totals.totalInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
    return quote.id;
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "retail_quote", entityId: id });
  revalidatePath("/vendas");
  if (clientId) revalidatePath(`/clientes/${clientId}`);
  if (attendanceId) revalidatePath(`/atendimento/${attendanceId}`);
  return { openUrl: `/api/quotes/${id}/pdf` };
}
