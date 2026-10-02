import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { clientPortalSessions, clients } from "@/db/schema";
import { CLIENT_PORTAL_COOKIE, portalHash } from "@/lib/client-portal";

export async function portalRequestClient(request: Request, organizationId: string) {
  const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${CLIENT_PORTAL_COOKIE}=([^;]+)`))?.[1];
  if (!token) return undefined;
  let decoded: string;
  try { decoded = decodeURIComponent(token); } catch { return undefined; }
  const [client] = await db.select({ id: clients.id, name: clients.name, phone: clients.phone, email: clients.email }).from(clientPortalSessions)
    .innerJoin(clients, eq(clients.id, clientPortalSessions.clientId))
    .where(and(eq(clientPortalSessions.organizationId, organizationId), eq(clients.organizationId, organizationId), eq(clientPortalSessions.tokenHash, portalHash(decoded)), gt(clientPortalSessions.expiresAt, new Date()))).limit(1);
  return client;
}
