import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientPortalAccessRequests, clients, organizations } from "@/db/schema";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_CODE_TTL_MINUTES, createPortalCredentials, portalHash, secureCookie } from "@/lib/client-portal";
import { normalizeBrazilianPhone } from "@/lib/phone";
import { sendClientPortalAccessEmail } from "@/lib/email";

const genericMessage = "Se os dados puderem ser validados, enviaremos um link e um código de acesso por e-mail.";
// Mesmo corpo e cookie para cadastros existentes, ausentes ou ambíguos.
function genericResponse(token = createPortalCredentials().token) {
  const response = NextResponse.json({ message: genericMessage });
  response.cookies.set(CLIENT_CHALLENGE_COOKIE, token, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", maxAge: CLIENT_CODE_TTL_MINUTES * 60 });
  return response;
}


export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    return await requestAccessCode(request, context);
  } catch (error) {
    console.error("[client-portal] Falha ao solicitar código de acesso", error);
    return NextResponse.json({ error: "Não foi possível enviar o código de acesso. Tente novamente mais tarde ou entre em contato com a clínica." }, { status: 503 });
  }
}

async function requestAccessCode(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const intent = body.intent === "register" ? "register" : "login";
  const identifier = typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const pendingName = typeof body.name === "string" ? body.name.trim() : "";
  const registrationEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const registrationPhone = typeof body.phone === "string" ? normalizeBrazilianPhone(body.phone) : "";
  const isEmail = /^\S+@\S+\.\S+$/.test(identifier);
  const phone = normalizeBrazilianPhone(identifier);
  if (intent === "login" && !isEmail && phone.length < 10) return NextResponse.json({ error: "Informe um e-mail ou celular com DDD." }, { status: 400 });
  if (intent === "register" && (pendingName.length < 2 || !/^\S+@\S+\.\S+$/.test(registrationEmail) || registrationPhone.length < 10)) return NextResponse.json({ error: "Informe nome, e-mail válido e celular com DDD." }, { status: 400 });

  if (!process.env.RESEND_API_KEY) {
    console.error("[client-portal] RESEND_API_KEY não configurada.");
    return NextResponse.json({ error: "O envio do código de acesso está indisponível. Entre em contato com a clínica." }, { status: 503 });
  }

  const [organization] = await db.select({ id: organizations.id, name: organizations.name, customDomain: organizations.customDomain, customDomainVerifiedAt: organizations.customDomainVerifiedAt }).from(organizations).where(and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true))).limit(1);
  if (!organization) return NextResponse.json({ error: "Página indisponível." }, { status: 404 });
  const lookupEmail = intent === "register" ? registrationEmail : isEmail ? identifier : "";
  const lookupPhone = intent === "register" ? registrationPhone : phone;
  const matches = await db.select({ clientId: clients.id, clientName: clients.name, clientEmail: clients.email, clientPhone: clients.phone }).from(clients)
    .where(and(eq(clients.organizationId, organization.id), or(lookupEmail ? sql`lower(${clients.email}) = ${lookupEmail}` : undefined, lookupPhone ? eq(clients.phone, lookupPhone) : undefined)));
  // Um identificador compartilhado não deve selecionar um cadastro arbitrariamente.
  if (matches.length > 1 || (intent === "login" && matches.length !== 1)) return genericResponse();
  const emailMatch = matches.find((item) => item.clientEmail?.toLowerCase() === lookupEmail);
  const phoneMatch = matches.find((item) => item.clientPhone === lookupPhone);
  if (intent === "register" && phoneMatch && phoneMatch.clientId !== emailMatch?.clientId) return genericResponse();
  const match = emailMatch || phoneMatch;
  if (intent === "login" && !match?.clientEmail) return genericResponse();
  const email = match?.clientEmail?.trim().toLowerCase() || registrationEmail;
  const clientName = match?.clientName || pendingName;

  const recentSince = new Date(Date.now() - 60_000);
  const [recent] = await db.select({ id: clientPortalAccessRequests.id, tokenHash: clientPortalAccessRequests.tokenHash }).from(clientPortalAccessRequests)
    .where(and(eq(clientPortalAccessRequests.organizationId, organization.id), eq(clientPortalAccessRequests.email, email), isNull(clientPortalAccessRequests.usedAt), gt(clientPortalAccessRequests.createdAt, recentSince)))
    .orderBy(desc(clientPortalAccessRequests.createdAt)).limit(1);
  if (recent) {
    const challenge = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${CLIENT_CHALLENGE_COOKIE}=([^;]+)`))?.[1];
    let token: string | undefined;
    try { if (challenge && portalHash(decodeURIComponent(challenge)) === recent.tokenHash) token = decodeURIComponent(challenge); } catch {}
    return genericResponse(token);
  }

  const credentials = createPortalCredentials();
  const [created] = await db.insert(clientPortalAccessRequests).values({
    organizationId: organization.id, clientId: match?.clientId || null, email,
    pendingName: match ? null : pendingName, pendingPhone: match ? null : registrationPhone,
    tokenHash: credentials.tokenHash, codeHash: credentials.codeHash,
    expiresAt: new Date(Date.now() + CLIENT_CODE_TTL_MINUTES * 60_000),
  }).returning({ id: clientPortalAccessRequests.id });
  const baseUrl = (organization.customDomain && organization.customDomainVerifiedAt ? `https://${organization.customDomain}` : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const voucher = /^[A-Za-z0-9_-]{3,40}$/.test(String(body.voucherCode ?? "")) ? `&voucher=${encodeURIComponent(String(body.voucherCode))}` : "";
  try {
    await sendClientPortalAccessEmail({
    email, clientName, organizationName: organization.name,
    accessUrl: `${baseUrl}/cliente/${slug}/verificar?token=${encodeURIComponent(credentials.token)}${voucher}`,
    code: credentials.code, requestId: created.id,
    });
  } catch (error) {
    // Um código que não foi enviado não deve bloquear a próxima tentativa.
    await db.update(clientPortalAccessRequests).set({ usedAt: new Date() }).where(eq(clientPortalAccessRequests.id, created.id));
    throw error;
  }
  return genericResponse(credentials.token);
}
