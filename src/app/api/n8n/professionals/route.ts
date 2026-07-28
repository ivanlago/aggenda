import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { professionals } from "@/db/schema";
import { requireN8nOrganization } from "@/lib/n8n-api";

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;

  const items = await db.select({
    id: professionals.id,
    name: professionals.name,
    title: professionals.title,
    email: professionals.email,
    phone: professionals.phone,
  }).from(professionals)
    .where(eq(professionals.organizationId, auth.organization.id))
    .orderBy(professionals.name);

  return NextResponse.json({ professionals: items });
}
