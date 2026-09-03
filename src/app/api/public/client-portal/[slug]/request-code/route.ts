import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientPortalAccessRequests, clients, organizations } from "@/db/schema";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_CODE_TTL_MINUTES, createPortalCredentials, secureCookie } from "@/lib/client-portal";
import { sendClientPortalAccessEmail } from "@/lib/email";

const genericMessage = "Se o e-mail estiver cadastrado, enviaremos um link e um código de acesso.";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });

  const [match] = await db.select({ clientId: clients.id, clientName: clients.name, organizationId: organizations.id, organizationName: organizations.name })
    .from(organizations).innerJoin(clients, eq(clients.organizationId, organizations.id))
    .where(and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true), sql`lower(${clients.email}) = ${email}`)).limit(1);
  if (!match) return NextResponse.json({ message: genericMessage });

  const recentSince = new Date(Date.now() - 60_000);
  const [recent] = await db.select({ id: clientPortalAccessRequests.id }).from(clientPortalAccessRequests)
    .where(and(eq(clientPortalAccessRequests.clientId, match.clientId), isNull(clientPortalAccessRequests.usedAt), gt(clientPortalAccessRequests.createdAt, recentSince)))
    .orderBy(desc(clientPortalAccessRequests.createdAt)).limit(1);
  if (recent) return NextResponse.json({ message: genericMessage });

  const credentials = createPortalCredentials();
  const [created] = await db.insert(clientPortalAccessRequests).values({
    organizationId: match.organizationId, clientId: match.clientId, email,
    tokenHash: credentials.tokenHash, codeHash: credentials.codeHash,
    expiresAt: new Date(Date.now() + CLIENT_CODE_TTL_MINUTES * 60_000),
  }).returning({ id: clientPortalAccessRequests.id });
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  await sendClientPortalAccessEmail({
    email, clientName: match.clientName, organizationName: match.organizationName,
    accessUrl: `${baseUrl}/cliente/${slug}/verificar?token=${encodeURIComponent(credentials.token)}`,
    code: credentials.code, requestId: created.id,
  });
  const response = NextResponse.json({ message: genericMessage, codeRequested: true });
  response.cookies.set(CLIENT_CHALLENGE_COOKIE, credentials.token, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", maxAge: CLIENT_CODE_TTL_MINUTES * 60 });
  return response;
}
