import { AppSearch } from "@/components/app-search";
import Image from "next/image";
import { HeaderShortcut } from "@/components/header-shortcut";
import { CommercialConversationBell } from "@/components/commercial-conversation-bell";
import { getHeaderIdentity, getOpenCommercialConversationCount } from "@/lib/header-data";
import { hasOrganizationPermission } from "@/lib/permissions";

export async function AppHeader({ organizationId, role, timezone, userId, userName }: { organizationId: string; role: string; timezone: string; userId: string; userName: string }) {
  const [identity, openCount] = await Promise.all([getHeaderIdentity(organizationId, userId, userName), getOpenCommercialConversationCount(organizationId, role)]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <header className="sticky top-0 z-20 flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 bg-background/90 px-4 py-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl sm:px-6">
    <div className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-3">
      <AppSearch />
      {hasOrganizationPermission(role, "appointments.manage") && <HeaderShortcut href="/agenda?novo=1" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-xs font-semibold tracking-wide text-white transition hover:bg-brand-dark"><Image src="/header/plus.svg" width={10.5} height={10.5} alt="" unoptimized />Novo Agendamento</HeaderShortcut>}
      {(hasOrganizationPermission(role, "sales.sell") || hasOrganizationPermission(role, "inventory.manage")) && <HeaderShortcut href="/vendas?novo=1#venda-form" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#904d00] px-4 text-xs font-semibold tracking-wide text-white transition hover:bg-[#783f00]"><Image src="/header/sale.svg" width={12} height={15} alt="" unoptimized />Nova venda</HeaderShortcut>}
    </div>
    <div className="ml-auto flex min-w-0 items-center justify-end gap-4">
      <CommercialConversationBell key={organizationId} organizationId={organizationId} initialCount={openCount} today={today} />
      <div className="min-w-0 border-l border-slate-200 pl-4 text-right"><p className="break-words text-sm font-semibold tracking-[0.14px] text-foreground">{identity.name}</p>{identity.subtitle && <p className="mt-1 max-w-sm break-words text-[11px] font-bold tracking-wide text-muted">{identity.subtitle}</p>}</div>
    </div>
  </header>;
}
