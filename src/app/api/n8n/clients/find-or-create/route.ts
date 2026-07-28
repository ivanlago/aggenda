import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { apiError, requireN8nOrganization } from "@/lib/n8n-api";

const inputSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(8),
  notes: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireN8nOrganization(request);
    if ("error" in auth) return auth.error;
    const input = inputSchema.parse(await request.json());

    const [existing] = await db.select().from(clients).where(and(
      eq(clients.organizationId, auth.organization.id),
      eq(clients.phone, input.phone)
    )).limit(1);
    if (existing) return NextResponse.json({ client: existing, created: false });

    const [client] = await db.insert(clients).values({
      organizationId: auth.organization.id,
      ...input,
    }).returning();
    return NextResponse.json({ client, created: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
