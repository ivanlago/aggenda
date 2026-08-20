import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const appHost = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : null;
  if (request.nextUrl.pathname === "/" && host && host !== appHost && host !== "localhost") {
    const [organization] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.customDomain, host)).limit(1);
    if (organization) return NextResponse.rewrite(new URL(`/agendar/${organization.slug}`, request.url));
  }
  const protectedPath = ["/dashboard", "/onboarding", "/profissionais", "/clientes", "/servicos", "/agendamentos", "/equipe", "/assinatura", "/admin", "/crescimento", "/documentos"].some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`));
  if (protectedPath && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/entrar", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/profissionais/:path*",
    "/clientes/:path*",
    "/servicos/:path*",
    "/agendamentos/:path*",
    "/equipe/:path*",
    "/assinatura/:path*",
    "/documentos/:path*",
    "/admin/:path*",
    "/crescimento/:path*",
    "/",
  ],
};
