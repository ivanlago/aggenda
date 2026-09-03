import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientPortalAccessRequests, clientPortalSessions, organizations } from "@/db/schema";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_PORTAL_COOKIE, CLIENT_SESSION_TTL_DAYS, createPortalSessionToken, portalHash, portalMatches, secureCookie } from "@/lib/client-portal";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  const challenge = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${CLIENT_CHALLENGE_COOKIE}=([^;]+)`))?.[1];
  if (!challenge || code.length !== 6) return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  const [item] = await db.select({ id: clientPortalAccessRequests.id, clientId: clientPortalAccessRequests.clientId, organizationId: clientPortalAccessRequests.organizationId, codeHash: clientPortalAccessRequests.codeHash, attempts: clientPortalAccessRequests.attempts })
    .from(clientPortalAccessRequests).innerJoin(organizations, eq(organizations.id, clientPortalAccessRequests.organizationId))
    .where(and(eq(organizations.slug, slug), eq(clientPortalAccessRequests.tokenHash, portalHash(decodeURIComponent(challenge))), isNull(clientPortalAccessRequests.usedAt), gt(clientPortalAccessRequests.expiresAt, new Date()))).limit(1);
  if (!item || item.attempts >= 5) return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  if (!portalMatches(code, item.codeHash)) {
    await db.update(clientPortalAccessRequests).set({ attempts: sql`${clientPortalAccessRequests.attempts} + 1` }).where(eq(clientPortalAccessRequests.id, item.id));
    return NextResponse.json({ error: "Código incorreto." }, { status: 400 });
  }
  const session = createPortalSessionToken();
  const expiresAt = new Date(Date.now() + CLIENT_SESSION_TTL_DAYS * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.update(clientPortalAccessRequests).set({ usedAt: new Date() }).where(eq(clientPortalAccessRequests.id, item.id));
    await tx.insert(clientPortalSessions).values({ organizationId: item.organizationId, clientId: item.clientId, tokenHash: session.tokenHash, expiresAt });
  });
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(CLIENT_PORTAL_COOKIE, session.token, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: `/cliente/${slug}`, maxAge: CLIENT_SESSION_TTL_DAYS * 86_400 });
  response.cookies.delete({ name: CLIENT_CHALLENGE_COOKIE, path: "/" });
  return response;
}
