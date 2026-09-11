import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { retailQuotes } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { requireAttendance } from "@/lib/attendance";
import { hasOrganizationPermission } from "@/lib/permissions";

export function canManageQuotes(role: string) {
  return hasOrganizationPermission(role, "sales.sell") || hasOrganizationPermission(role, "inventory.manage");
}

export async function requireRetailQuote(id: string) {
  const context = await requireOrganization();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [quote] = await db.select().from(retailQuotes).where(and(eq(retailQuotes.id, id), eq(retailQuotes.organizationId, context.organization.id))).limit(1);
  if (!quote) notFound();
  if (context.organization.role === "professional") {
    if (!quote.attendanceId) notFound();
    await requireAttendance(quote.attendanceId);
  } else if (!canManageQuotes(context.organization.role) && !hasOrganizationPermission(context.organization.role, "inventory.read") && !hasOrganizationPermission(context.organization.role, "documents.read")) notFound();
  return { ...context, quote };
}
