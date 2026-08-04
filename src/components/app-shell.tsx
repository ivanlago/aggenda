import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  LayoutDashboard,
  Settings2,
  UsersRound,
  UserRoundCog,
  Wrench,
  ScrollText,
  DatabaseBackup,
} from "lucide-react";
import Link from "next/link";

import { selectActiveOrganization } from "@/actions/access";
import { hasOrganizationPermission, type OrganizationPermission } from "@/lib/permissions";
import {
  getOrganizationMemberships,
  getPlatformMembership,
  requireOrganization,
} from "@/lib/session";

import { SignOutButton } from "./sign-out-button";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { session, organization } = await requireOrganization();
  const [memberships, platformMembership] = await Promise.all([
    getOrganizationMemberships(session.user.id),
    getPlatformMembership(session.user.id),
  ]);
  const navigationItems: Array<{
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    permission: OrganizationPermission;
  }> = [
    { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard, permission: "organization.read" },
    {
      href: "/agendamentos",
      label: organization.appointmentLabelPlural,
      icon: CalendarDays,
      permission: "appointments.read",
    },
    { href: "/disponibilidade", label: "Disponibilidade", icon: CalendarClock, permission: "availability.read" },
    { href: "/clientes", label: organization.clientLabelPlural, icon: UsersRound, permission: "clients.read" },
    {
      href: "/profissionais",
      label: organization.professionalLabelPlural,
      icon: BriefcaseBusiness,
      permission: "professionals.read",
    },
    { href: "/servicos", label: organization.serviceLabelPlural, icon: Wrench, permission: "services.read" },
    { href: "/dados", label: "Importar e exportar", icon: DatabaseBackup, permission: "clients.read" },
    { href: "/equipe", label: "Equipe e acesso", icon: UserRoundCog, permission: "team.read" },
    { href: "/configuracoes", label: "Configurações", icon: Settings2, permission: "organization.settings.manage" },
    { href: "/auditoria", label: "Auditoria", icon: ScrollText, permission: "audit.read" },
    { href: "/assinatura", label: "Plano e cobrança", icon: BriefcaseBusiness, permission: "billing.manage" },
  ];
  const navigation = navigationItems.filter((item) =>
    hasOrganizationPermission(organization.role, item.permission)
  );

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
          {platformMembership && (
            <Link
              href="/admin"
              className="flex shrink-0 items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-bold text-white"
            >
              <UserRoundCog className="size-4" /> Administração SaaS
            </Link>
          )}
        </nav>
        <div className="absolute bottom-5 hidden w-[210px] border-t border-white/15 pt-5 lg:block">
          {memberships.length > 1 && (
            <form action={selectActiveOrganization} className="mb-4 grid gap-2">
              <select className="rounded-lg border-white/20 bg-white/10 px-2 py-2 text-xs" name="organizationId" defaultValue={organization.id}>
                {memberships.map((membership) => (
                  <option className="text-black" key={membership.id} value={membership.id}>{membership.name}</option>
                ))}
              </select>
              <button className="rounded-lg bg-white/10 px-2 py-1.5 text-xs font-bold">Trocar empresa</button>
            </form>
          )}
          <p className="truncate text-sm font-extrabold">{organization.name}</p>
          <p className="mt-1 truncate text-xs text-white/60">{session.user.email}</p>
          <div className="mt-4"><SignOutButton /></div>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
