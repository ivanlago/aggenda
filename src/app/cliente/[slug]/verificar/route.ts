import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientPortalAccessRequests, clientPortalSessions, organizations } from "@/db/schema";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_PORTAL_COOKIE, CLIENT_SESSION_TTL_DAYS, createPortalSessionToken, portalHash, secureCookie } from "@/lib/client-portal";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = new URL(request.url).searchParams.get("token") || "";
  const [item] = await db.select({ id: clientPortalAccessRequests.id, clientId: clientPortalAccessRequests.clientId, organizationId: clientPortalAccessRequests.organizationId })
    .from(clientPortalAccessRequests).innerJoin(organizations, eq(organizations.id, clientPortalAccessRequests.organizationId))
    .where(and(eq(organizations.slug, slug), eq(clientPortalAccessRequests.tokenHash, portalHash(token)), isNull(clientPortalAccessRequests.usedAt), gt(clientPortalAccessRequests.expiresAt, new Date()))).limit(1);
  if (!item) return NextResponse.redirect(new URL(`/cliente/${slug}?erro=link-expirado`, request.url));
  const session = createPortalSessionToken();
  const expiresAt = new Date(Date.now() + CLIENT_SESSION_TTL_DAYS * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.update(clientPortalAccessRequests).set({ usedAt: new Date() }).where(eq(clientPortalAccessRequests.id, item.id));
    await tx.insert(clientPortalSessions).values({ organizationId: item.organizationId, clientId: item.clientId, tokenHash: session.tokenHash, expiresAt });
  });
  const response = NextResponse.redirect(new URL(`/cliente/${slug}`, request.url));
  response.cookies.set(CLIENT_PORTAL_COOKIE, session.token, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: `/cliente/${slug}`, maxAge: CLIENT_SESSION_TTL_DAYS * 86_400 });
  response.cookies.delete({ name: CLIENT_CHALLENGE_COOKIE, path: "/" });
  return response;
}
