import { after } from "next/server";
import { drainVoucherCampaign, validVoucherDrain } from "@/lib/voucher-drain";

export const maxDuration = 60;
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const organizationId = String(body.organizationId || "");
  if (!validVoucherDrain(organizationId, String(body.expires || ""), request.headers.get("x-voucher-drain") || "")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  after(async () => { await drainVoucherCampaign(organizationId); });
  return Response.json({ queued: true }, { status: 202 });
}
