import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
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
  ChevronDown,
  CircleDollarSign,
  FileCheck2,
  HandCoins,
  Landmark,
  MessageCircleMore,
  ReceiptText,
  TrendingUp,
  FileSignature,
  ShoppingCart,
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
    children?: NavigationItem[];
  };
  const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
    { label: "Dashboard", items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "organization.read" },
    ] },
    { label: "Agenda", items: [
      { href: "/agenda", label: "Agenda", icon: CalendarDays, permission: "appointments.read" },
    ] },
    { label: organization.clientLabelPlural, items: [
      { href: "/clientes", label: organization.clientLabelPlural, icon: UsersRound, permission: "clients.read" },
    ] },
    { label: "Venda", items: [
      { href: "/vendas", label: "Venda", icon: ShoppingCart, permission: "inventory.read" },
    ] },
    { label: "Atendimento", items: [
      { href: "/servicos", label: organization.serviceLabelPlural, icon: Wrench, permission: "services.read" },
      { href: "/pacotes", label: "Pacotes", icon: PackageOpen, permission: "services.read" },
      { href: "/estoque", label: "Estoque", icon: Boxes, permission: "inventory.read" },
      { href: "/documentos", label: "Documentos", icon: FileSignature, permission: "documents.read", children: [
        { href: "/documentos", label: "Visão geral e histórico", icon: LayoutDashboard, permission: "documents.read", secondary: true },
        { href: "/documentos/anamneses", label: "Anamnese", icon: ScrollText, permission: "documents.read", secondary: true },
        { href: "/documentos/atestados", label: "Atestado médico", icon: FileCheck2, permission: "documents.read", secondary: true },
        { href: "/documentos/receitas", label: "Receita médica", icon: ReceiptText, permission: "documents.read", secondary: true },
        { href: "/documentos/exames", label: "Solicitação de exames", icon: FileSignature, permission: "documents.read", secondary: true },
        { href: "/documentos/termos", label: "Termos e contratos", icon: FileCheck2, permission: "documents.read", secondary: true },
      ] },
    ] },
    { label: "CRM comercial", items: [
      { href: "/crescimento", label: "Crescimento e recorrência", icon: TrendingUp, permission: "crm.read" },
      { href: "/crm", label: "Funil e oportunidades", icon: KanbanSquare, permission: "crm.read" },
      { href: "/crm/inbox", label: "Conversas comerciais", icon: MessageCircleMore, permission: "crm.read" },
      { href: "/crm/propostas", label: "Propostas", icon: FileCheck2, permission: "crm.read" },
      { href: "/crm/relatorios", label: "Relatórios do CRM", icon: ChartNoAxesCombined, permission: "crm.read" },
    ] },
    { label: "Financeiro", items: [
      { href: "/financeiro", label: "Contas e fluxo de caixa", icon: WalletCards, permission: "finance.read" },
      { href: "/financeiro/relatorios", label: "DRE e indicadores", icon: ChartNoAxesCombined, permission: "finance.read" },
      { href: "/financeiro/comissoes", label: "Comissões", icon: HandCoins, permission: "finance.read" },
      { href: "/financeiro/fechamento-caixa", label: "Fechamento de caixa", icon: CircleDollarSign, permission: "finance.read" },
      { href: "/financeiro/conciliacao-ofx", label: "Conciliação OFX", icon: Landmark, permission: "finance.read" },
      { href: "/financeiro/cobrancas", label: "Pagamentos", icon: BanknoteArrowDown, permission: "finance.read" },
      { href: "/financeiro/nfse", label: "Emissão de NFS-e", icon: ReceiptText, permission: "finance.read" },
    ] },
    { label: "Automação", items: [
      { href: "/automacoes", label: "WhatsApp e IA", icon: Bot, permission: "integrations.manage" },
    ] },
    { label: "Administração", items: [
      ...(organization.role === "professional" ? [] : [{ href: "/implantacao", label: "Implantação guiada", icon: Rocket, permission: "organization.read" as OrganizationPermission }]),
      { href: "/dados", label: "Importar e exportar", icon: DatabaseBackup, permission: "clients.manage" },
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
    <div className="min-h-screen bg-[#f3f5f1] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b bg-brand p-4 text-white shadow-[4px_0_24px_rgba(14,63,46,0.12)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden lg:border-b-0">
        <div className="flex items-center justify-between lg:block lg:shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 text-xl font-extrabold">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand-dark">
              <CalendarCheck className="size-5" />
            </span>
            Aggenda
          </Link>
          <div className="lg:hidden"><SignOutButton compact /></div>
        </div>
        <nav className="app-menu-scrollbar mt-5 flex gap-2 overflow-x-auto overflow-y-hidden pb-1 lg:mt-7 lg:grid lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-x-hidden lg:overflow-y-auto lg:pb-4">
          {navigation.map((group) => group.items.length === 1 && group.items[0].label === group.label ? (
            <Link
              key={group.label}
              href={group.items[0].href}
              className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              {(() => { const Icon = group.items[0].icon; return <Icon className="size-4" />; })()} {group.label}
            </Link>
          ) : (
            <details
              className="group/nav relative shrink-0 lg:block"
              key={group.label}
              name="app-navigation"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/65 transition hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden">
                {group.label}
                <ChevronDown className="size-3.5 transition group-open/nav:rotate-180" />
              </summary>
              <div className="absolute left-0 top-full z-30 mt-2 grid min-w-64 gap-0.5 rounded-2xl bg-brand p-2 shadow-xl ring-1 ring-white/15 lg:static lg:mt-1 lg:min-w-0 lg:bg-transparent lg:p-0 lg:pl-2 lg:shadow-none lg:ring-0">
                {group.items.map(({ href, label, icon: Icon, secondary, children }) => children ? (
                  <details className="group/submenu" key={href}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-3"><Icon className="size-4" />{label}</span>
                      <ChevronDown className="size-3.5 transition group-open/submenu:rotate-180" />
                    </summary>
                    <div className="ml-5 grid gap-0.5 border-l border-white/15 pl-2">
                      {children.filter((child) => hasOrganizationPermission(organization.role, child.permission)).map(({ href: childHref, label: childLabel, icon: ChildIcon }) => <Link key={childHref} href={childHref} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white"><ChildIcon className="size-3.5" />{childLabel}</Link>)}
                    </div>
                  </details>
                ) : (
                  <Link key={href} href={href} className={`flex shrink-0 items-center rounded-xl py-2 font-bold text-white/75 transition hover:bg-white/10 hover:text-white ${secondary ? "gap-2 px-3 text-xs" : "gap-3 px-3 text-sm"}`}>
                    <Icon className={secondary ? "size-3.5" : "size-4"} /> {label}
                  </Link>
                ))}
              </div>
            </details>
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
