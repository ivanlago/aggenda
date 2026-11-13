import { ChevronDown } from "lucide-react";
import { selectActiveOrganization } from "@/actions/access";
import { SignOutButton } from "./sign-out-button";
import Link from "next/link";

import { AppSearch } from "@/components/app-search";
import Image from "next/image";
import { HeaderShortcut } from "@/components/header-shortcut";
import { CommercialConversationBell } from "@/components/commercial-conversation-bell";
import { getHeaderIdentity, getOpenCommercialConversationCount } from "@/lib/header-data";
import { hasOrganizationPermission, type TeamPermissionOverrides } from "@/lib/permissions";

export async function AppHeader({ organizationName, userEmail, memberships, organizationId, role, teamPermissionOverrides, timezone, userId, userName }: { organizationName: string; userEmail: string; memberships: Array<{ id: string; name: string }>; organizationId: string; role: string; teamPermissionOverrides?: TeamPermissionOverrides | null; timezone: string; userId: string; userName: string }) {
  const [identity, openCount] = await Promise.all([getHeaderIdentity(organizationId, userId, userName), getOpenCommercialConversationCount(organizationId, role)]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <header className="app-header relative z-20 flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 px-4 py-4 shadow-[0_1px_8px_rgba(18,60,70,0.04)] backdrop-blur-xl sm:px-6">
    <div className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-3">
      <AppSearch />
      {hasOrganizationPermission(role, "appointments.manage", teamPermissionOverrides) && <HeaderShortcut href="/agenda?novo=1" className="app-header-new-appointment inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-xs font-semibold tracking-wide text-white transition hover:bg-brand-dark"><Image src="/header/plus.svg" width={10.5} height={10.5} alt="" unoptimized />Novo Agendamento</HeaderShortcut>}
      {(hasOrganizationPermission(role, "sales.sell") || hasOrganizationPermission(role, "inventory.manage")) && <HeaderShortcut href="/vendas?novo=1#venda-form" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#904d00] px-4 text-xs font-semibold tracking-wide text-white transition hover:bg-[#783f00]"><Image src="/header/sale.svg" width={12} height={15} alt="" unoptimized />Nova venda</HeaderShortcut>}
    </div>
    <div className="ml-auto flex min-w-0 items-center justify-end gap-4">
      <CommercialConversationBell key={organizationId} organizationId={organizationId} initialCount={openCount} today={today} />
      <details className="group/account relative min-w-0 border-l border-slate-200 pl-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-right [&::-webkit-details-marker]:hidden">
          <span className="min-w-0"><span className="block break-words text-sm font-semibold tracking-[0.14px] text-foreground">{identity.name}</span>{identity.subtitle && <span className="mt-1 block max-w-sm break-words text-[11px] font-bold tracking-wide text-muted">{identity.subtitle}</span>}</span>
          <ChevronDown className="size-4 shrink-0 text-muted transition group-open/account:rotate-180" />
        </summary>
        <div className="absolute right-0 top-full z-30 mt-3 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="break-words text-sm font-extrabold">{organizationName}</p>
          <p className="mt-1 break-words text-xs text-muted">{userEmail}</p>
          {memberships.length > 1 && <form action={selectActiveOrganization} className="mt-3 grid gap-2">
            <label htmlFor="header-organization" className="text-xs font-bold">Empresa</label>
            <select id="header-organization" className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm" name="organizationId" defaultValue={organizationId}>
              {memberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.name}</option>)}
            </select>
            <button className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white">Trocar empresa</button>
          </form>}
          {<Link href={`/equipe#membro-${userId}`} className="mt-3 block text-xs font-bold text-brand">Meu cadastro e assinaturas</Link>}
          <div className="mt-3 border-t border-slate-200 pt-3"><SignOutButton /></div>
        </div>
      </details>
    </div>
  </header>;
}
