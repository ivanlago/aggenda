import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  LayoutDashboard,
  UsersRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { requireOrganization } from "@/lib/session";

import { SignOutButton } from "./sign-out-button";

const navigation = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: UsersRound },
  { href: "/profissionais", label: "Profissionais", icon: BriefcaseBusiness },
  { href: "/servicos", label: "Serviços", icon: Wrench },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { session, organization } = await requireOrganization();

  return (
    <div className="min-h-screen bg-[#f3f5f1] lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-b bg-brand p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0">
        <div className="flex items-center justify-between lg:block">
          <Link href="/dashboard" className="flex items-center gap-3 text-xl font-extrabold">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand-dark">
              <CalendarCheck className="size-5" />
            </span>
            Aggenda
          </Link>
          <div className="lg:hidden"><SignOutButton compact /></div>
        </div>
        <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-10 lg:grid lg:overflow-visible">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-5 hidden w-[210px] border-t border-white/15 pt-5 lg:block">
          <p className="truncate text-sm font-extrabold">{organization.name}</p>
          <p className="mt-1 truncate text-xs text-white/60">{session.user.email}</p>
          <div className="mt-4"><SignOutButton /></div>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
