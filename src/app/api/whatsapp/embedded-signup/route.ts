import { and, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { whatsappChannels } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganizationMembership } from "@/lib/session";
import { encryptWhatsAppToken } from "@/lib/whatsapp-token";

export const runtime = "nodejs";

type SignupPayload = { code?: string; wabaId?: string; phoneNumberId?: string };
type TokenResponse = { access_token?: string; token_type?: string; expires_in?: number; error?: { message?: string } };
type PhoneResponse = { id?: string; display_phone_number?: string; verified_name?: string; status?: string; error?: { message?: string } };

function graphUrl(path: string) {
  const version = process.env.META_WHATSAPP_GRAPH_VERSION ?? "v23.0";
  return `https://graph.facebook.com/${version}/${path}`;
}

export async function POST(request: NextRequest) {
  const { organization } = await requireOrganizationMembership();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json({ error: "Integração Meta ainda não configurada." }, { status: 503 });
  }

  const payload = await request.json() as SignupPayload;
  if (!payload.code || !payload.wabaId || !payload.phoneNumberId) {
    return NextResponse.json({ error: "A Meta não retornou todos os dados do canal." }, { status: 400 });
  }

  const [conflict] = await db.select({ organizationId: whatsappChannels.organizationId })
    .from(whatsappChannels)
    .where(and(
      eq(whatsappChannels.phoneNumberId, payload.phoneNumberId),
      ne(whatsappChannels.organizationId, organization.id),
    )).limit(1);
  if (conflict) return NextResponse.json({ error: "Este número já pertence a outra organização." }, { status: 409 });

  try {
    const tokenQuery = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code: payload.code,
    });
    const tokenResponse = await fetch(`https://graph.facebook.com/oauth/access_token?${tokenQuery}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const tokenData = await tokenResponse.json() as TokenResponse;
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "Não foi possível obter autorização da Meta.");
    }

    const headers = { authorization: `Bearer ${tokenData.access_token}` };
    const [phoneResponse, subscriptionResponse] = await Promise.all([
      fetch(graphUrl(`${payload.phoneNumberId}?fields=id,display_phone_number,verified_name,status`), {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }),
      fetch(graphUrl(`${payload.wabaId}/subscribed_apps`), {
        method: "POST",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }),
    ]);
    const phoneData = await phoneResponse.json() as PhoneResponse;
    if (!phoneResponse.ok || phoneData.id !== payload.phoneNumberId) {
      throw new Error(phoneData.error?.message ?? "Não foi possível validar o número retornado pela Meta.");
    }
    if (!subscriptionResponse.ok) {
      const detail = await subscriptionResponse.text();
      throw new Error(`Não foi possível assinar o webhook: ${detail.slice(0, 300)}`);
    }

    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;
    const [channel] = await db.insert(whatsappChannels).values({
      organizationId: organization.id,
      phoneNumberId: payload.phoneNumberId,
      whatsappBusinessAccountId: payload.wabaId,
      displayPhoneNumber: phoneData.display_phone_number,
      verifiedName: phoneData.verified_name,
      connectionStatus: "active",
      encryptedAccessToken: encryptWhatsAppToken(tokenData.access_token),
      tokenExpiresAt,
      connectedAt: new Date(),
      lastConnectionError: null,
      isActive: true,
    }).onConflictDoUpdate({
      target: whatsappChannels.phoneNumberId,
      set: {
        organizationId: organization.id,
        whatsappBusinessAccountId: payload.wabaId,
        displayPhoneNumber: phoneData.display_phone_number,
        verifiedName: phoneData.verified_name,
        connectionStatus: "active",
        encryptedAccessToken: encryptWhatsAppToken(tokenData.access_token),
        tokenExpiresAt,
        connectedAt: new Date(),
        lastConnectionError: null,
        isActive: true,
        updatedAt: new Date(),
      },
    }).returning({ id: whatsappChannels.id });

    return NextResponse.json({ connected: true, channelId: channel.id, displayPhoneNumber: phoneData.display_phone_number });
  } catch (error) {
    console.error("[whatsapp/embedded-signup] falha", {
      organizationId: organization.id,
      phoneNumberId: payload.phoneNumberId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao conectar o WhatsApp." }, { status: 502 });
  }
}
