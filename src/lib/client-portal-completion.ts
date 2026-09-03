import { and, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clientPortalAccessRequests, clientPortalSessions, clients } from "@/db/schema";
import { CLIENT_SESSION_TTL_DAYS, createPortalSessionToken } from "@/lib/client-portal";

export async function completeClientPortalAccess(request: {
  id: string;
  organizationId: string;
  clientId: string | null;
  email: string;
  pendingName: string | null;
  pendingPhone: string | null;
}) {
  const session = createPortalSessionToken();
  const expiresAt = new Date(Date.now() + CLIENT_SESSION_TTL_DAYS * 86_400_000);
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(clientPortalAccessRequests).set({ usedAt: new Date() })
      .where(and(eq(clientPortalAccessRequests.id, request.id), isNull(clientPortalAccessRequests.usedAt)))
      .returning({ id: clientPortalAccessRequests.id });
    if (!claimed) return null;
    let clientId = request.clientId;
    if (!clientId) {
      if (!request.pendingName || !request.pendingPhone) throw new Error("INCOMPLETE_REGISTRATION");
      const matches = await tx.select({ id: clients.id, email: clients.email, phone: clients.phone }).from(clients)
        .where(and(eq(clients.organizationId, request.organizationId), or(eq(clients.phone, request.pendingPhone), sql`lower(${clients.email}) = ${request.email}`)));
      if (matches.length) {
        const emailMatch = matches.find((item) => item.email?.toLowerCase() === request.email);
        const phoneConflict = matches.some((item) => item.phone === request.pendingPhone && item.id !== emailMatch?.id);
        if (!emailMatch || phoneConflict) throw new Error("REGISTRATION_CONFLICT");
        clientId = emailMatch.id;
      } else {
        const [created] = await tx.insert(clients).values({ organizationId: request.organizationId, name: request.pendingName, phone: request.pendingPhone, email: request.email }).returning({ id: clients.id });
        clientId = created.id;
      }
    }
    await tx.insert(clientPortalSessions).values({ organizationId: request.organizationId, clientId, tokenHash: session.tokenHash, expiresAt });
    return { token: session.token, clientId };
  });
}
