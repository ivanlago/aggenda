import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/session";
import { getOpenCommercialConversationCount } from "@/lib/header-data";

export async function GET() {
  const { organization } = await requireOrganization();
  const count = await getOpenCommercialConversationCount(organization.id, organization.role);
  return NextResponse.json({ organizationId: organization.id, count }, { headers: { "Cache-Control": "private, no-store" } });
}
