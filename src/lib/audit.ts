import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function writeAuditLog(input: {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values(input);
}
