import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { services } from "@/db/schema";
import { requireN8nOrganization } from "@/lib/n8n-api";

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;

  const items = await db.select().from(services)
    .where(and(eq(services.organizationId, auth.organization.id), eq(services.isActive, true)))
    .orderBy(services.name);

  return NextResponse.json({ services: items });
}
