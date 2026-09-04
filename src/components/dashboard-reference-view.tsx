import { and, eq, gte, lt } from "drizzle-orm";
import { BanknoteArrowDown, CalendarDays, Cake, CircleDollarSign, ShoppingCart, UserPlus, WalletCards } from "lucide-react";
import Link from "next/link";

import { db } from "@/db";
import { appointments, clients, financialEntries } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

import { PageHeader } from "./page-header";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusColors: Record<string, string> = { scheduled: "bg-sky-500", confirmed: "bg-emerald-500", completed: "bg-violet-500", cancelled: "bg-rose-400", no_show: "bg-amber-500" };

export async function DashboardReferenceView() {
  const { session, organization } = await requireOrganization();
  const now = new Date();
  const today = organizationDate(now, organization.timezone);
  const [year, month] = today.split("-").map(Number);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const monthEnd = nextMonth.toISOString().slice(0, 10);
  const canReadFinance = hasOrganizationPermission(organization.role, "finance.read");
  const canManageAppointments = hasOrganizationPermission(organization.role, "appointments.manage");
  const canManageClients = hasOrganizationPermission(organization.role, "clients.manage");
  const canManageInventory = hasOrganizationPermission(organization.role, "inventory.manage");
  const canManageFinance = hasOrganizationPermission(organization.role, "finance.manage");

  const [monthAppointments, monthEntries, birthdayClients] = await Promise.all([
    db.select({ startsAt: appointments.startsAt, status: appointments.status }).from(appointments).where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, new Date(`${monthStart}T00:00:00-03:00`)), lt(appointments.startsAt, new Date(`${monthEnd}T00:00:00-03:00`)))),
    canReadFinance ? db.select({ type: financialEntries.type, status: financialEntries.status, amount: financialEntries.amountInCents, dueDate: financialEntries.dueDate, realizedDate: financialEntries.realizedDate }).from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), gte(financialEntries.dueDate, monthStart), lt(financialEntries.dueDate, monthEnd))) : Promise.resolve([]),
    db.select({ id: clients.id, name: clients.name, birthDate: clients.birthDate, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)),
  ]);

  const sum = (predicate: (entry: typeof monthEntries[number]) => boolean) => monthEntries.filter(predicate).reduce((total, entry) => total + entry.amount, 0);
  const receivableToday = sum((entry) => entry.type === "receivable" && entry.status === "pending" && entry.dueDate === today);
  const payableToday = sum((entry) => entry.type === "payable" && entry.status === "pending" && entry.dueDate === today);
  const overdueReceivable = sum((entry) => entry.type === "receivable" && entry.status === "pending" && entry.dueDate < today);
  const overduePayable = sum((entry) => entry.type === "payable" && entry.status === "pending" && entry.dueDate < today);
  const expectedReceivable = sum((entry) => entry.type === "receivable" && entry.status === "pending");
  const expectedPayable = sum((entry) => entry.type === "payable" && entry.status === "pending");
  const received = sum((entry) => entry.type === "receivable" && entry.status === "received");
  const paid = sum((entry) => entry.type === "payable" && entry.status === "paid");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const eventsByDay = new Map<number, string[]>();
  monthAppointments.forEach((item) => {
    const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: organization.timezone, day: "numeric" }).format(item.startsAt));
    eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), item.status]);
  });
  const birthdays = birthdayClients.filter((client) => client.birthDate && Number(client.birthDate.slice(5, 7)) === month).sort((a, b) => (a.birthDate ?? "").localeCompare(b.birthDate ?? ""));
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: organization.timezone }).format(now);
  const quickLinks = [
    { show: canManageAppointments, href: "/agenda?novo=1", label: "Novo Agendamento", icon: CalendarDays, color: "bg-cyan-600" },
    { show: canManageClients, href: "/clientes", label: `Novo ${organization.clientLabel}`, icon: UserPlus, color: "bg-fuchsia-600" },
    { show: canManageInventory, href: "/vendas", label: "Nova Venda", icon: ShoppingCart, color: "bg-violet-600" },
    { show: canManageFinance, href: "/financeiro", label: "Nova Conta a Pagar", icon: BanknoteArrowDown, color: "bg-amber-600" },
  ].filter((item) => item.show);

  return <div className="page-wrap">
    <PageHeader eyebrow={organization.name} title="Dashboard" description={`Olá, ${session.user.name.split(" ")[0]}. Acompanhe os principais indicadores do negócio.`} />
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <section><h2 className="mb-3 text-lg font-extrabold">Acesso rápido</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickLinks.map(({ href, label, icon: Icon, color }) => <Link key={label} href={href} className={`${color} flex min-h-24 items-center gap-3 rounded-2xl p-4 font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg`}><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><Icon className="size-6" /></span><span>{label}</span></Link>)}</div></section>
        {canReadFinance && <>
          <section className="mt-6"><h2 className="mb-3 text-lg font-extrabold">Saúde financeira</h2><div className="grid gap-3 sm:grid-cols-2"><FinancialCard label="A receber hoje" value={receivableToday} href="/financeiro" icon={CircleDollarSign} tone="emerald" /><FinancialCard label="A pagar hoje" value={payableToday} href="/financeiro" icon={WalletCards} tone="rose" /><FinancialCard label="Recebimentos vencidos" value={overdueReceivable} href="/financeiro" icon={CircleDollarSign} tone="sky" soft /><FinancialCard label="Pagamentos vencidos" value={overduePayable} href="/financeiro" icon={WalletCards} tone="amber" soft /></div></section>
          <section className="panel mt-6"><h2 className="text-lg font-extrabold">Contas no período</h2><p className="mt-1 text-sm text-muted">{new Date(`${monthStart}T12:00:00`).toLocaleDateString("pt-BR")} a {new Date(new Date(`${monthEnd}T12:00:00`).getTime() - 86400000).toLocaleDateString("pt-BR")}</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="border-b text-left text-xs uppercase text-muted"><tr><th className="p-3">Status</th><th className="p-3 text-right">Contas a receber</th><th className="p-3 text-right">Contas a pagar</th><th className="p-3 text-right">Saldo</th></tr></thead><tbody className="divide-y"><SummaryRow label="Previsto" incoming={expectedReceivable} outgoing={expectedPayable} /><SummaryRow label="Vencido" incoming={overdueReceivable} outgoing={overduePayable} /><SummaryRow label="Realizado" incoming={received} outgoing={paid} /></tbody></table></div></section>
          <section className="panel mt-6"><h2 className="text-lg font-extrabold">Fluxo de caixa no período</h2><p className="mt-1 text-sm text-muted">Comparativo entre valores realizados e previstos.</p><div className="mt-6 grid gap-5 sm:grid-cols-2"><FlowBar label="Entradas" realized={received} expected={expectedReceivable} color="bg-emerald-500" /><FlowBar label="Saídas" realized={paid} expected={expectedPayable} color="bg-rose-500" /></div></section>
        </>}
      </div>
      <aside className="grid content-start gap-5">
        <section><h2 className="mb-3 text-lg font-extrabold">Agenda</h2><div className="panel"><div className="mb-4 flex items-center justify-between"><strong className="capitalize">{monthName}</strong><Link className="text-sm font-extrabold text-brand" href="/agenda">Abrir</Link></div><div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-muted">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <span key={day}>{day}</span>)}</div><div className="mt-2 grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }).map((_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => <div key={day} className={`min-h-12 rounded-lg p-1 text-center text-xs ${day === Number(today.slice(8, 10)) ? "bg-brand text-white" : "bg-slate-50"}`}><span className="font-bold">{day}</span><div className="mt-1 flex flex-wrap justify-center gap-0.5">{(eventsByDay.get(day) ?? []).slice(0, 5).map((status, index) => <i key={`${status}-${index}`} className={`size-1.5 rounded-full ${statusColors[status] ?? "bg-slate-400"}`} />)}</div></div>)}</div></div></section>
        <section><h2 className="mb-3 text-lg font-extrabold">Aniversariantes</h2><div className="overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-sm">{birthdays.slice(0, 8).map((client) => <div className="flex items-center gap-3 border-b border-white/15 p-4 last:border-0" key={client.id}><Cake className="size-5 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate font-bold">{client.name}</p><p className="text-xs text-white/70">{client.phone || "Sem telefone"}</p></div><strong>{client.birthDate?.slice(8, 10)}/{client.birthDate?.slice(5, 7)}</strong></div>)}{!birthdays.length && <p className="p-6 text-center text-sm text-white/80">Nenhum aniversariante neste mês.</p>}</div></section>
      </aside>
    </div>
  </div>;
}

function FinancialCard({ label, value, href, icon: Icon, tone, soft = false }: { label: string; value: number; href: string; icon: typeof CircleDollarSign; tone: "emerald" | "rose" | "sky" | "amber"; soft?: boolean }) {
  const tones = { emerald: soft ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-emerald-500 bg-emerald-500 text-white", rose: soft ? "border-rose-300 bg-rose-50 text-rose-700" : "border-rose-500 bg-rose-500 text-white", sky: "border-sky-300 bg-sky-50 text-sky-700", amber: "border-amber-300 bg-amber-50 text-amber-700" };
  return <article className={`flex items-center gap-4 rounded-2xl border-2 p-5 ${tones[tone]}`}><Icon className="size-9 shrink-0" /><div className="min-w-0 flex-1"><p className="text-2xl font-extrabold">{money(value)}</p><p className="text-sm opacity-80">{label}</p></div><Link href={href} className="rounded-xl border border-current px-3 py-2 text-sm font-extrabold">Abrir</Link></article>;
}

function SummaryRow({ label, incoming, outgoing }: { label: string; incoming: number; outgoing: number }) { return <tr><td className="p-3 font-bold">{label}</td><td className="p-3 text-right font-bold text-emerald-600">{money(incoming)}</td><td className="p-3 text-right font-bold text-rose-600">{money(outgoing)}</td><td className="p-3 text-right font-extrabold text-sky-700">{money(incoming - outgoing)}</td></tr>; }

function FlowBar({ label, realized, expected, color }: { label: string; realized: number; expected: number; color: string }) {
  const total = Math.max(realized + expected, 1); const realizedWidth = Math.round(realized / total * 100);
  return <div><div className="flex justify-between text-sm"><strong>{label}</strong><span className="text-muted">{money(realized)} realizado</span></div><div className="mt-2 flex h-4 overflow-hidden rounded-full bg-slate-100"><span className={color} style={{ width: `${realizedWidth}%` }} /><span className="bg-slate-300" style={{ width: `${100 - realizedWidth}%` }} /></div><p className="mt-2 text-xs text-muted">Previsto pendente: {money(expected)}</p></div>;
}
