import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { formatPhone } from "@/lib/phone";
import {
  appointments,
  clients,
  organizations,
  professionalGoogleCalendarAccounts,
  professionals,
  services,
} from "@/db/schema";

const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";
const GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type GoogleUserInfoResponse = { email: string };
type GoogleCalendarEventResponse = { id: string };

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;

  if (!clientId || !clientSecret || !appUrl) {
    throw new Error("Google Calendar OAuth não está configurado.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/$/, "")}/api/google-calendar/callback`,
  };
}

function getApplicationSecret() {
  const secret =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Configure GOOGLE_TOKEN_ENCRYPTION_KEY ou BETTER_AUTH_SECRET com ao menos 32 caracteres."
    );
  }
  return secret;
}

function getTokenDecryptionSecrets() {
  return [...new Set([
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
    process.env.BETTER_AUTH_SECRET,
  ].filter((secret): secret is string => Boolean(secret && secret.length >= 32)))];
}

function deriveTokenKey(secret: string) {
  return createHmac("sha256", secret)
    .update("aggenda-google-calendar-tokens")
    .digest();
}

function encryptToken(value: string) {
  const key = deriveTokenKey(getApplicationSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptToken(value: string) {
  if (!value.startsWith("v1.")) return value;
  const [, encodedIv, encodedTag, encodedValue] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedValue) {
    throw new Error("Token Google armazenado em formato inválido.");
  }
  let lastError: unknown;
  for (const secret of getTokenDecryptionSecrets()) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        deriveTokenKey(secret),
        Buffer.from(encodedIv, "base64url")
      );
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Não foi possível descriptografar o token Google armazenado.", {
    cause: lastError,
  });
}

async function assertGoogleResponse(response: Response) {
  if (response.ok) return;
  const body = await response.text();
  throw new Error(
    body || `Google Calendar respondeu com status ${response.status}.`
  );
}

function signState(payload: string) {
  return createHmac("sha256", getApplicationSecret())
    .update(payload)
    .digest("base64url");
}

export function getGoogleCalendarAuthorizationUrl({
  professionalId,
  organizationId,
}: {
  professionalId: string;
  organizationId: string;
}) {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const payload = Buffer.from(
    JSON.stringify({ professionalId, organizationId, issuedAt: Date.now() })
  ).toString("base64url");
  const state = `${payload}.${signState(payload)}`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [GOOGLE_EMAIL_SCOPE, GOOGLE_CALENDAR_SCOPE].join(" ")
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export function parseGoogleCalendarAuthorizationState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Estado OAuth inválido.");
  const expected = Buffer.from(signState(payload));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new Error("Assinatura OAuth inválida.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    professionalId?: string;
    organizationId?: string;
    issuedAt?: number;
  };
  if (
    !parsed.professionalId ||
    !parsed.organizationId ||
    !parsed.issuedAt ||
    Date.now() - parsed.issuedAt > STATE_MAX_AGE_MS
  ) {
    throw new Error("Autorização OAuth inválida ou expirada.");
  }
  return parsed as {
    professionalId: string;
    organizationId: string;
    issuedAt: number;
  };
}

export async function exchangeGoogleCalendarCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  await assertGoogleResponse(response);
  return (await response.json()) as GoogleTokenResponse;
}

export function hasGoogleCalendarEventsScope(scope?: string) {
  return scope?.split(" ").includes(GOOGLE_CALENDAR_SCOPE) ?? false;
}

async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await assertGoogleResponse(response);
  return (await response.json()) as GoogleUserInfoResponse;
}

export async function upsertProfessionalGoogleCalendarAccount({
  professionalId,
  organizationId,
  tokens,
}: {
  professionalId: string;
  organizationId: string;
  tokens: GoogleTokenResponse;
}) {
  const userInfo = await getGoogleUserInfo(tokens.access_token);
  const [existing] = await db
    .select()
    .from(professionalGoogleCalendarAccounts)
    .where(
      and(
        eq(professionalGoogleCalendarAccounts.professionalId, professionalId),
        eq(professionalGoogleCalendarAccounts.organizationId, organizationId)
      )
    )
    .limit(1);
  const values = {
    googleEmail: userInfo.email,
    calendarId: "primary",
    accessToken: encryptToken(tokens.access_token),
    refreshToken: tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : existing?.refreshToken,
    accessTokenExpiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
    scope: tokens.scope,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(professionalGoogleCalendarAccounts)
      .set(values)
      .where(eq(professionalGoogleCalendarAccounts.id, existing.id));
    return;
  }
  await db.insert(professionalGoogleCalendarAccounts).values({
    organizationId,
    professionalId,
    ...values,
  });
}

async function refreshAccessToken(
  account: typeof professionalGoogleCalendarAccounts.$inferSelect
) {
  if (
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(account.accessToken);
  }
  if (!account.refreshToken) return decryptToken(account.accessToken);

  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptToken(account.refreshToken),
      grant_type: "refresh_token",
    }),
  });
  await assertGoogleResponse(response);
  const tokens = (await response.json()) as GoogleTokenResponse;
  await db
    .update(professionalGoogleCalendarAccounts)
    .set({
      accessToken: encryptToken(tokens.access_token),
      accessTokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      scope: tokens.scope ?? account.scope,
      updatedAt: new Date(),
    })
    .where(eq(professionalGoogleCalendarAccounts.id, account.id));
  return tokens.access_token;
}

async function updateSyncStatus({
  appointmentId,
  eventId,
  calendarId,
  status,
  error,
}: {
  appointmentId: string;
  eventId?: string | null;
  calendarId?: string | null;
  status: "synced" | "not_connected" | "error" | "deleted";
  error?: string | null;
}) {
  await db
    .update(appointments)
    .set({
      googleCalendarEventId: eventId,
      googleCalendarId: calendarId,
      googleCalendarSyncStatus: status,
      googleCalendarSyncError: error,
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, appointmentId));
}

export async function syncAppointmentToGoogleCalendar(appointmentId: string) {
  const [appointment] = await db
    .select({
      id: appointments.id,
      organizationId: appointments.organizationId,
      professionalId: appointments.professionalId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      eventId: appointments.googleCalendarEventId,
      eventCalendarId: appointments.googleCalendarId,
      clientName: clients.name,
      clientEmail: clients.email,
      clientPhone: clients.phone,
      professionalName: professionals.name,
      professionalEmail: professionals.email,
      serviceName: services.name,
      organizationName: organizations.name,
      timezone: organizations.timezone,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(organizations, eq(organizations.id, appointments.organizationId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!appointment) return;
  if (!appointment.professionalId || !appointment.professionalName) {
    await updateSyncStatus({ appointmentId, status: "not_connected", eventId: null, calendarId: null, error: null });
    return;
  }
  const [account] = await db
    .select()
    .from(professionalGoogleCalendarAccounts)
    .where(
      and(
        eq(professionalGoogleCalendarAccounts.professionalId, appointment.professionalId),
        eq(professionalGoogleCalendarAccounts.organizationId, appointment.organizationId)
      )
    )
    .limit(1);
  if (!account) {
    await updateSyncStatus({ appointmentId, status: "not_connected", eventId: null, calendarId: null, error: null });
    return;
  }

  try {
    const accessToken = await refreshAccessToken(account);
    const shouldUpdate =
      Boolean(appointment.eventId) &&
      appointment.eventCalendarId === account.calendarId;
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(account.calendarId)}/events`;
    const response = await fetch(
      shouldUpdate
        ? `${baseUrl}/${encodeURIComponent(appointment.eventId!)}`
        : baseUrl,
      {
        method: shouldUpdate ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: `${appointment.serviceName} - ${appointment.clientName}`,
          description: [
            `Cliente: ${appointment.clientName}`,
            appointment.clientPhone ? `Telefone: ${formatPhone(appointment.clientPhone)}` : null,
            appointment.clientEmail ? `E-mail: ${appointment.clientEmail}` : null,
            `Profissional: ${appointment.professionalName}`,
            `Serviço: ${appointment.serviceName}`,
            `Empresa: ${appointment.organizationName}`,
          ].filter(Boolean).join("\n"),
          start: { dateTime: appointment.startsAt.toISOString(), timeZone: appointment.timezone },
          end: { dateTime: appointment.endsAt.toISOString(), timeZone: appointment.timezone },
        }),
      }
    );
    await assertGoogleResponse(response);
    const event = (await response.json()) as GoogleCalendarEventResponse;
    await updateSyncStatus({
      appointmentId,
      eventId: event.id,
      calendarId: account.calendarId,
      status: "synced",
      error: null,
    });
  } catch (error) {
    console.error("Falha ao sincronizar agendamento com Google Calendar", error);
    await updateSyncStatus({
      appointmentId,
      eventId: appointment.eventId,
      calendarId: appointment.eventCalendarId,
      status: "error",
      error: error instanceof Error ? error.message.slice(0, 2000) : "Erro desconhecido na sincronização.",
    });
  }
}

export async function deleteAppointmentFromGoogleCalendar(appointmentId: string) {
  const [appointment] = await db
    .select({
      professionalId: appointments.professionalId,
      organizationId: appointments.organizationId,
      eventId: appointments.googleCalendarEventId,
      calendarId: appointments.googleCalendarId,
    })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!appointment?.professionalId || !appointment.eventId || !appointment.calendarId) return;
  const [account] = await db
    .select()
    .from(professionalGoogleCalendarAccounts)
    .where(
      and(
        eq(professionalGoogleCalendarAccounts.professionalId, appointment.professionalId),
        eq(professionalGoogleCalendarAccounts.organizationId, appointment.organizationId)
      )
    )
    .limit(1);
  if (!account) return;
  try {
    const accessToken = await refreshAccessToken(account);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(appointment.calendarId)}/events/${encodeURIComponent(appointment.eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (response.status !== 404) await assertGoogleResponse(response);
    await updateSyncStatus({ appointmentId, eventId: null, calendarId: null, status: "deleted", error: null });
  } catch (error) {
    console.error("Falha ao remover agendamento do Google Calendar", error);
    await updateSyncStatus({
      appointmentId,
      eventId: appointment.eventId,
      calendarId: appointment.calendarId,
      status: "error",
      error: error instanceof Error ? error.message.slice(0, 2000) : "Erro desconhecido na remoção.",
    });
  }
}
