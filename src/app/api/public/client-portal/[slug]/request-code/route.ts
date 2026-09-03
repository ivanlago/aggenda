import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientPortalAccessRequests, clients, organizations } from "@/db/schema";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_CODE_TTL_MINUTES, createPortalCredentials, secureCookie } from "@/lib/client-portal";
import { sendClientPortalAccessEmail } from "@/lib/email";

const genericMessage = "Se os dados puderem ser validados, enviaremos um link e um código de acesso por e-mail.";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const intent = body.intent === "register" ? "register" : "login";
  const identifier = typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const pendingName = typeof body.name === "string" ? body.name.trim() : "";
  const registrationEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const registrationPhone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const isEmail = /^\S+@\S+\.\S+$/.test(identifier);
  const phone = identifier.replace(/\D/g, "");
  if (intent === "login" && !isEmail && phone.length < 10) return NextResponse.json({ error: "Informe um e-mail ou celular com DDD." }, { status: 400 });
  if (intent === "register" && (pendingName.length < 2 || !/^\S+@\S+\.\S+$/.test(registrationEmail) || registrationPhone.length < 10)) return NextResponse.json({ error: "Informe nome, e-mail válido e celular com DDD." }, { status: 400 });

  const [organization] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true))).limit(1);
  if (!organization) return NextResponse.json({ error: "Página indisponível." }, { status: 404 });
  const lookupEmail = intent === "register" ? registrationEmail : isEmail ? identifier : "";
  const lookupPhone = intent === "register" ? registrationPhone : phone;
  const matches = await db.select({ clientId: clients.id, clientName: clients.name, clientEmail: clients.email, clientPhone: clients.phone }).from(clients)
    .where(and(eq(clients.organizationId, organization.id), or(sql`lower(${clients.email}) = ${lookupEmail}`, eq(clients.phone, lookupPhone))));
  const emailMatch = matches.find((item) => item.clientEmail?.toLowerCase() === lookupEmail);
  const phoneMatch = matches.find((item) => item.clientPhone === lookupPhone);
  if (intent === "register" && phoneMatch && phoneMatch.clientId !== emailMatch?.clientId) return NextResponse.json({ message: genericMessage });
  const match = emailMatch || phoneMatch;
  if (intent === "login" && !match?.clientEmail) return NextResponse.json({ message: genericMessage });
  const email = match?.clientEmail?.trim().toLowerCase() || registrationEmail;
  const clientName = match?.clientName || pendingName;

  const recentSince = new Date(Date.now() - 60_000);
  const [recent] = await db.select({ id: clientPortalAccessRequests.id }).from(clientPortalAccessRequests)
    .where(and(eq(clientPortalAccessRequests.organizationId, organization.id), eq(clientPortalAccessRequests.email, email), isNull(clientPortalAccessRequests.usedAt), gt(clientPortalAccessRequests.createdAt, recentSince)))
    .orderBy(desc(clientPortalAccessRequests.createdAt)).limit(1);
  if (recent) return NextResponse.json({ message: genericMessage });

  const credentials = createPortalCredentials();
  const [created] = await db.insert(clientPortalAccessRequests).values({
    organizationId: organization.id, clientId: match?.clientId || null, email,
    pendingName: match ? null : pendingName, pendingPhone: match ? null : registrationPhone,
    tokenHash: credentials.tokenHash, codeHash: credentials.codeHash,
    expiresAt: new Date(Date.now() + CLIENT_CODE_TTL_MINUTES * 60_000),
  }).returning({ id: clientPortalAccessRequests.id });
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  await sendClientPortalAccessEmail({
    email, clientName, organizationName: organization.name,
    accessUrl: `${baseUrl}/cliente/${slug}/verificar?token=${encodeURIComponent(credentials.token)}`,
    code: credentials.code, requestId: created.id,
  });
  const response = NextResponse.json({ message: genericMessage, codeRequested: true });
  response.cookies.set(CLIENT_CHALLENGE_COOKIE, credentials.token, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", maxAge: CLIENT_CODE_TTL_MINUTES * 60 });
  return response;
}
