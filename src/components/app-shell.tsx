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
  PackageOpen,
  WalletCards,
  Bot,
  Rocket,
  KanbanSquare,
  Boxes,
  BanknoteArrowDown,
  ChartNoAxesCombined,
  CircleDollarSign,
  FileCheck2,
  HandCoins,
  Landmark,
  MessageCircleMore,
  ReceiptText,
  TrendingUp,
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
  type NavigationItem = {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    permission: OrganizationPermission;
    secondary?: boolean;
  };
  const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
    { label: "Início", items: [
      { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard, permission: "organization.read" },
      { href: "/implantacao", label: "Implantação guiada", icon: Rocket, permission: "organization.read" },
    ] },
    { label: "Atendimento", items: [
      { href: "/agendamentos", label: organization.appointmentLabelPlural, icon: CalendarDays, permission: "appointments.read" },
      { href: "/disponibilidade", label: "Disponibilidade", icon: CalendarClock, permission: "availability.read" },
      { href: "/clientes", label: organization.clientLabelPlural, icon: UsersRound, permission: "clients.read" },
      { href: "/profissionais", label: organization.professionalLabelPlural, icon: BriefcaseBusiness, permission: "professionals.read" },
      { href: "/servicos", label: organization.serviceLabelPlural, icon: Wrench, permission: "services.read" },
      { href: "/pacotes", label: "Pacotes", icon: PackageOpen, permission: "services.read" },
      { href: "/estoque", label: "Controle de estoque", icon: Boxes, permission: "inventory.read" },
    ] },
    { label: "CRM comercial", items: [
      { href: "/crescimento", label: "Crescimento e recorrência", icon: TrendingUp, permission: "crm.read" },
      { href: "/crm", label: "Funil e oportunidades", icon: KanbanSquare, permission: "crm.read" },
      { href: "/crm/inbox", label: "Conversas comerciais", icon: MessageCircleMore, permission: "crm.read", secondary: true },
      { href: "/crm/propostas", label: "Propostas", icon: FileCheck2, permission: "crm.read", secondary: true },
      { href: "/crm/relatorios", label: "Relatórios do CRM", icon: ChartNoAxesCombined, permission: "crm.read", secondary: true },
    ] },
    { label: "Financeiro", items: [
      { href: "/financeiro", label: "Contas e fluxo de caixa", icon: WalletCards, permission: "finance.read" },
      { href: "/financeiro/relatorios", label: "DRE e indicadores", icon: ChartNoAxesCombined, permission: "finance.read", secondary: true },
      { href: "/financeiro/comissoes", label: "Comissões", icon: HandCoins, permission: "finance.read", secondary: true },
      { href: "/financeiro/fechamento-caixa", label: "Fechamento de caixa", icon: CircleDollarSign, permission: "finance.read", secondary: true },
      { href: "/financeiro/conciliacao-ofx", label: "Conciliação OFX", icon: Landmark, permission: "finance.read", secondary: true },
      { href: "/financeiro/cobrancas", label: "Pagamentos", icon: BanknoteArrowDown, permission: "finance.read", secondary: true },
      { href: "/financeiro/nfse", label: "Emissão de NFS-e", icon: ReceiptText, permission: "finance.read", secondary: true },
    ] },
    { label: "Automação", items: [
      { href: "/automacoes", label: "WhatsApp e IA", icon: Bot, permission: "integrations.manage" },
    ] },
    { label: "Administração", items: [
      { href: "/dados", label: "Importar e exportar", icon: DatabaseBackup, permission: "clients.read" },
      { href: "/equipe", label: "Equipe e acesso", icon: UserRoundCog, permission: "team.read" },
      { href: "/configuracoes", label: "Configurações", icon: Settings2, permission: "organization.settings.manage" },
      { href: "/auditoria", label: "Auditoria", icon: ScrollText, permission: "audit.read" },
      { href: "/assinatura", label: "Plano e cobrança", icon: BriefcaseBusiness, permission: "billing.manage" },
    ] },
  ];
  const navigation = navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasOrganizationPermission(organization.role, item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-[#f3f5f1] lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-b bg-brand p-5 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:border-b-0">
        <div className="flex items-center justify-between lg:block lg:shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 text-xl font-extrabold">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand-dark">
              <CalendarCheck className="size-5" />
            </span>
            Aggenda
          </Link>
          <div className="lg:hidden"><SignOutButton compact /></div>
        </div>
        <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:grid lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-x-hidden lg:overflow-y-auto lg:pb-4">
          {navigation.map((group) => (
            <section className="contents lg:block" key={group.label}>
              <p className="hidden px-3 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/45 first:pt-0 lg:block">{group.label}</p>
              <div className="contents lg:grid lg:gap-0.5">
                {group.items.map(({ href, label, icon: Icon, secondary }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex shrink-0 items-center rounded-xl py-2 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white ${secondary ? "gap-2 pl-7 pr-3 text-xs" : "gap-3 px-3"}`}
                  >
                    <Icon className={secondary ? "size-3.5" : "size-4"} /> {label}
                  </Link>
                ))}
              </div>
            </section>
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
        <div className="mt-4 hidden shrink-0 border-t border-white/15 pt-4 lg:block">
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
