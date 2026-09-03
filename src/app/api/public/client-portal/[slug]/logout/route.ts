import { NextResponse } from "next/server";
import { CLIENT_PORTAL_COOKIE } from "@/lib/client-portal";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = NextResponse.json({ ok: true });
  response.cookies.delete({ name: CLIENT_PORTAL_COOKIE, path: `/cliente/${slug}` });
  return response;
}
