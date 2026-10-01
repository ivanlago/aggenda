import { and, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clientPortalSessions, organizations } from "@/db/schema";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_PORTAL_COOKIE, portalHash, secureCookie } from "@/lib/client-portal";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await cookies();
  const tokens = store.getAll(CLIENT_PORTAL_COOKIE).map((cookie) => portalHash(cookie.value));
  if (tokens.length) {
    const [organization] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (organization) await db.update(clientPortalSessions).set({ expiresAt: new Date() }).where(and(eq(clientPortalSessions.organizationId, organization.id), inArray(clientPortalSessions.tokenHash, tokens)));
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CLIENT_PORTAL_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: secureCookie() });
  response.cookies.delete({ name: CLIENT_CHALLENGE_COOKIE, path: "/" });
  // Cookies com o mesmo nome e caminhos diferentes precisam de cabeçalhos separados.
  response.headers.append("Set-Cookie", `${CLIENT_PORTAL_COOKIE}=; Path=/cliente/${encodeURIComponent(slug)}; Max-Age=0; HttpOnly; SameSite=Lax${secureCookie() ? "; Secure" : ""}`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
