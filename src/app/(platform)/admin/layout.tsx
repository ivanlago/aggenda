import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { requirePlatformMember } from "@/lib/session";

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, platform } = await requirePlatformMember();
  return (
    <div className="min-h-screen bg-[#f3f5f1]">
      <header className="border-b bg-brand text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-4">
          <Link className="text-lg font-extrabold" href="/admin">Aggenda Admin</Link>
          <nav className="flex flex-1 gap-4 text-sm font-bold text-white/75">
            <Link href="/admin/empresas">Empresas</Link>
            <Link href="/admin/usuarios">Usuários</Link>
            <Link href="/dashboard">Voltar ao aplicativo</Link>
          </nav>
          <div className="text-right text-xs">
            <p className="font-bold">{session.user.email}</p>
            <p className="text-white/60">{platform.role}</p>
          </div>
          <SignOutButton compact />
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-5">{children}</main>
    </div>
  );
}
