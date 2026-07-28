import { NextRequest, NextResponse } from "next/server";

import { requireN8nOrganization } from "@/lib/n8n-api";

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ organizations: [auth.organization] });
}
