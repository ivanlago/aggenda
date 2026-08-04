import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
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
    "/admin/:path*",
  ],
};
