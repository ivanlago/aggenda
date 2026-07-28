import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { organizations } from "@/db/schema";

function unauthorized(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireN8nOrganization(request: NextRequest) {
  const configuredKey = process.env.N8N_API_KEY;
  const configuredOrganizationId = process.env.N8N_CLINIC_ID;
  const suppliedKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const requestedOrganizationId = request.headers.get("x-clinic-id");

  if (!configuredKey) return { error: unauthorized("N8N_API_KEY is not configured", 500) };
  if (!suppliedKey) return { error: unauthorized("Unauthorized", 401) };

  const expected = Buffer.from(configuredKey);
  const supplied = Buffer.from(suppliedKey);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return { error: unauthorized("Unauthorized", 401) };
  }

  const organizationId = configuredOrganizationId || requestedOrganizationId;
  if (!organizationId) return { error: unauthorized("X-Clinic-Id header is required", 400) };
  if (
    configuredOrganizationId &&
    requestedOrganizationId &&
    configuredOrganizationId !== requestedOrganizationId
  ) {
    return { error: unauthorized("X-Clinic-Id does not match the API key scope", 403) };
  }

  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name, timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) return { error: unauthorized("Organization not found", 404) };
  return { organization };
}

export function apiError(error: unknown) {
  console.error("[Aggenda n8n]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 400 }
  );
}
