import { and, desc, eq, gte, lt } from "drizzle-orm";
import { BadgePercent, ChartNoAxesCombined, CreditCard, MessageCircleMore } from "lucide-react";
import Link from "next/link";

import { sendRecoveryMessage } from "@/actions/growth";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clients, services } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { GrowthTabs } from "@/components/growth-tabs";
import { VouchersPanel } from "@/components/vouchers-panel";
import { ProcedureReturnsPanel } from "@/components/procedure-returns-panel";

import { CommercialConversationsPanel, type ConversationFilters } from "@/components/commercial-conversations-panel";

import { CrmPipelinePanel } from "@/components/crm-pipeline-panel";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const maxDuration = 60;

export const metadata = { title: "Crescimento e recorrência" };

export default async function GrowthPage({ searchParams }: { searchParams: Promise<ConversationFilters & { returnState?: string; returnSearch?: string; tab?: string }> }) {
  const { organization } = await requireOrganization();
  const query = await searchParams;
  const initialTab = query.tab === "voucher" || query.tab === "recuperacao" || query.tab === "conversas" || query.tab === "funil" ? query.tab : "retornos";
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const recoveryLimit = new Date(now.getTime() - organization.patientRecoveryDays * 86_400_000);
  const [monthAppointments, pastAppointments, clientRows] = await Promise.all([
    db.select({ status: appointments.status, price: appointments.priceInCents, cost: services.estimatedCostInCents }).from(appointments).innerJoin(services, eq(services.id, appointments.serviceId)).where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, monthStart), lt(appointments.startsAt, nextMonth))),
    db.select({ clientId: appointments.clientId, startsAt: appointments.startsAt }).from(appointments).where(and(eq(appointments.organizationId, organization.id), lt(appointments.startsAt, now))).orderBy(desc(appointments.startsAt)),
    db.select().from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
  ]);
  const attended = monthAppointments.filter((item) => item.status === "completed"); const absences = monthAppointments.filter((item) => item.status === "no_show");
  const presenceRate = attended.length + absences.length ? Math.round(attended.length / (attended.length + absences.length) * 100) : 0;
  const revenue = attended.reduce((sum, item) => sum + (item.price ?? 0), 0); const margin = attended.reduce((sum, item) => sum + (item.price ?? 0) - item.cost, 0);
  const latest = new Map<string, Date>(); for (const item of pastAppointments) if (!latest.has(item.clientId)) latest.set(item.clientId, item.startsAt);
  const inactive = clientRows.filter((client) => client.phone && (!latest.get(client.id) || latest.get(client.id)! < recoveryLimit)).slice(0, 30);
  return <div className="page-wrap">
    <PageHeader eyebrow="Receita previsível" title="Crescimento e recorrência" description="Acompanhe presença e margem, recupere pacientes e crie vouchers para campanhas." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[
      [ChartNoAxesCombined, `${presenceRate}%`, "Taxa de presença no mês"],
      [CreditCard, money(revenue), "Receita de atendimentos concluídos"],
      [BadgePercent, money(margin), "Margem estimada após custos"],
    ].map(([Icon, value, label]) => <article className="panel" key={String(label)}><Icon className="size-5 text-brand" /><p className="mt-6 text-2xl font-extrabold">{String(value)}</p><p className="mt-1 text-sm text-muted">{String(label)}</p></article>)}</section>

    <GrowthTabs key={JSON.stringify(query)} initialTab={initialTab} panels={{
      retornos: hasOrganizationPermission(organization.role, "crm.read") ? <ProcedureReturnsPanel organizationId={organization.id} timezone={organization.timezone} canManage={hasOrganizationPermission(organization.role, "crm.manage")} filter={query.returnState} search={query.returnSearch} /> : null,
      recuperacao: (
    <section className="mt-5 grid gap-5">
      <article className="panel"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">Recuperação de pacientes</h2><p className="mt-1 text-sm text-muted">Sem atendimento há {organization.patientRecoveryDays} dias ou nunca atendidos.</p></div><Link className="secondary-button" href="/configuracoes">Configurar prazo</Link></div><div className="mt-4 divide-y">{inactive.map((client) => <div className="flex items-center justify-between gap-3 py-3" key={client.id}><div><p className="font-bold">{client.name}</p><p className="text-xs text-muted">Último atendimento: {latest.get(client.id)?.toLocaleDateString("pt-BR") ?? "nenhum"}</p></div><ActionForm action={sendRecoveryMessage} successMessage="Convite de retorno enfileirado."><input type="hidden" name="clientId" value={client.id} /><button className="secondary-button"><MessageCircleMore className="mr-2 size-4" />Convidar</button></ActionForm></div>)}{!inactive.length && <p className="empty-state">Nenhum paciente elegível no prazo atual.</p>}</div></article>

    </section>
      ),
      voucher: hasOrganizationPermission(organization.role, "crm.read") ? <VouchersPanel organization={organization} referenceTime={now.getTime()} /> : null,
      conversas: hasOrganizationPermission(organization.role, "crm.read") ? <CommercialConversationsPanel organizationId={organization.id} timezone={organization.timezone} canManage={hasOrganizationPermission(organization.role, "chat.inbox")} canCreateLead={hasOrganizationPermission(organization.role, "crm.manage")} filters={query} /> : null,
      funil: hasOrganizationPermission(organization.role, "crm.read") ? <CrmPipelinePanel organizationId={organization.id} timezone={organization.timezone} /> : null,
    }} />
    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Aquisição pública</h2><p className="mt-1 text-sm text-muted">Compartilhe a página personalizada da empresa para receber agendamentos.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="secondary-button" href={`/agendar/${organization.slug}`} target="_blank">Ver página pública</Link></div></section>
  </div>;
}
