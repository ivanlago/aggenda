import { and, desc, eq, gte, lt } from "drizzle-orm";
import { BadgePercent, ChartNoAxesCombined, CreditCard, MessageCircleMore, UserRoundSearch } from "lucide-react";
import Link from "next/link";

import { createMembership, createVoucher, sendRecoveryMessage } from "@/actions/growth";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clientMemberships, clients, organizationFinancialIntegrations, servicePackages, services, vouchers } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const metadata = { title: "Crescimento e recorrência" };

export default async function GrowthPage() {
  const { organization } = await requireOrganization();
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const recoveryLimit = new Date(now.getTime() - organization.patientRecoveryDays * 86_400_000);
  const [monthAppointments, pastAppointments, clientRows, voucherRows, membershipRows, packageRows, asaas] = await Promise.all([
    db.select({ status: appointments.status, price: appointments.priceInCents, cost: services.estimatedCostInCents }).from(appointments).innerJoin(services, eq(services.id, appointments.serviceId)).where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, monthStart), lt(appointments.startsAt, nextMonth))),
    db.select({ clientId: appointments.clientId, startsAt: appointments.startsAt }).from(appointments).where(and(eq(appointments.organizationId, organization.id), lt(appointments.startsAt, now))).orderBy(desc(appointments.startsAt)),
    db.select().from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select().from(vouchers).where(eq(vouchers.organizationId, organization.id)).orderBy(desc(vouchers.createdAt)),
    db.select({ id: clientMemberships.id, status: clientMemberships.status, monthlyPriceInCents: clientMemberships.monthlyPriceInCents, nextRenewalAt: clientMemberships.nextRenewalAt, client: clients.name, packageName: servicePackages.name }).from(clientMemberships).innerJoin(clients, eq(clients.id, clientMemberships.clientId)).innerJoin(servicePackages, eq(servicePackages.id, clientMemberships.packageId)).where(eq(clientMemberships.organizationId, organization.id)).orderBy(desc(clientMemberships.createdAt)),
    db.select().from(servicePackages).where(and(eq(servicePackages.organizationId, organization.id), eq(servicePackages.isActive, true))).orderBy(servicePackages.name),
    db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "asaas"))).limit(1),
  ]);
  const attended = monthAppointments.filter((item) => item.status === "completed"); const absences = monthAppointments.filter((item) => item.status === "no_show");
  const presenceRate = attended.length + absences.length ? Math.round(attended.length / (attended.length + absences.length) * 100) : 0;
  const revenue = attended.reduce((sum, item) => sum + (item.price ?? 0), 0); const margin = attended.reduce((sum, item) => sum + (item.price ?? 0) - item.cost, 0);
  const latest = new Map<string, Date>(); for (const item of pastAppointments) if (!latest.has(item.clientId)) latest.set(item.clientId, item.startsAt);
  const inactive = clientRows.filter((client) => client.phone && (!latest.get(client.id) || latest.get(client.id)! < recoveryLimit)).slice(0, 30);
  const activeMembershipRevenue = membershipRows.filter((item) => item.status === "active").reduce((sum, item) => sum + item.monthlyPriceInCents, 0);
  return <div className="page-wrap">
    <PageHeader eyebrow="Receita previsível" title="Crescimento e recorrência" description="Acompanhe presença e margem, recupere pacientes e venda vouchers ou mensalidades sem substituir os serviços atuais do WhatsApp." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      [ChartNoAxesCombined, `${presenceRate}%`, "Taxa de presença no mês"],
      [CreditCard, money(revenue), "Receita de atendimentos concluídos"],
      [BadgePercent, money(margin), "Margem estimada após custos"],
      [UserRoundSearch, money(activeMembershipRevenue), "Receita recorrente mensal ativa"],
    ].map(([Icon, value, label]) => <article className="panel" key={String(label)}><Icon className="size-5 text-brand" /><p className="mt-6 text-2xl font-extrabold">{String(value)}</p><p className="mt-1 text-sm text-muted">{String(label)}</p></article>)}</section>

    <section className="mt-5 grid gap-5 xl:grid-cols-2">
      <article className="panel"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">Recuperação de pacientes</h2><p className="mt-1 text-sm text-muted">Sem atendimento há {organization.patientRecoveryDays} dias ou nunca atendidos.</p></div><Link className="secondary-button" href="/configuracoes">Configurar prazo</Link></div><div className="mt-4 divide-y">{inactive.map((client) => <div className="flex items-center justify-between gap-3 py-3" key={client.id}><div><p className="font-bold">{client.name}</p><p className="text-xs text-muted">Último atendimento: {latest.get(client.id)?.toLocaleDateString("pt-BR") ?? "nenhum"}</p></div><ActionForm action={sendRecoveryMessage} successMessage="Convite de retorno enfileirado."><input type="hidden" name="clientId" value={client.id} /><button className="secondary-button"><MessageCircleMore className="mr-2 size-4" />Convidar</button></ActionForm></div>)}{!inactive.length && <p className="empty-state">Nenhum paciente elegível no prazo atual.</p>}</div></article>

      <ActionForm action={createVoucher} successMessage="Voucher criado." className="panel form-stack"><h2 className="text-lg font-extrabold">Novo voucher</h2><p className="text-sm text-muted">Crie códigos para campanhas, presentes ou retorno de pacientes.</p><input className="field" name="code" required placeholder="VOLTE10" /><input className="field" name="description" placeholder="Descrição da campanha" /><div className="grid gap-3 sm:grid-cols-2"><select className="field" name="discountType"><option value="fixed">Valor em reais</option><option value="percentage">Percentual</option></select><input className="field" name="discountValue" required inputMode="decimal" placeholder="Benefício" /></div><div className="grid gap-3 sm:grid-cols-2"><input className="field" name="maxUses" type="number" min="1" placeholder="Limite de usos" /><input className="field" name="validUntil" type="date" aria-label="Validade" /></div><button className="primary-button">Criar voucher</button></ActionForm>
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-2">
      <ActionForm action={createMembership} successMessage="Assinatura criada no Asaas." className="panel form-stack"><div><h2 className="text-lg font-extrabold">Nova assinatura mensal</h2><p className="mt-1 text-sm text-muted">O pacote define os benefícios; o Asaas da empresa cobra mensalmente.</p></div>{!asaas.length && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Conecte a conta Asaas antes de ativar mensalidades. <Link className="underline" href="/financeiro/cobrancas">Configurar agora</Link></p>}<select className="field" name="clientId" required defaultValue=""><option value="" disabled>Selecione o paciente</option>{clientRows.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><select className="field" name="packageId" required defaultValue=""><option value="" disabled>Selecione os benefícios</option>{packageRows.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}</select><input className="field" name="document" required inputMode="numeric" placeholder="CPF/CNPJ do pagador" /><div className="grid gap-3 sm:grid-cols-2"><input className="field" name="monthlyPrice" required inputMode="decimal" placeholder="Mensalidade" /><input className="field" name="billingDay" type="number" min="1" max="28" defaultValue="5" aria-label="Dia da cobrança" /></div><button className="primary-button" disabled={!asaas.length}>Ativar cobrança recorrente</button></ActionForm>
      <article className="panel"><h2 className="text-lg font-extrabold">Assinaturas ativas</h2><div className="mt-4 divide-y">{membershipRows.map((item) => <div className="py-3" key={item.id}><div className="flex justify-between gap-3"><p className="font-bold">{item.client} · {item.packageName}</p><span className="status-pill">{item.status}</span></div><p className="mt-1 text-xs text-muted">{money(item.monthlyPriceInCents)}/mês{item.nextRenewalAt ? ` · próxima ${item.nextRenewalAt.toLocaleDateString("pt-BR")}` : ""}</p></div>)}{!membershipRows.length && <p className="empty-state">Nenhuma assinatura criada.</p>}</div><h3 className="mt-6 font-extrabold">Vouchers disponíveis</h3><div className="mt-3 flex flex-wrap gap-2">{voucherRows.map((voucher) => <span className="status-pill" key={voucher.id}>{voucher.code} · {voucher.usedCount}/{voucher.maxUses ?? "∞"}</span>)}{!voucherRows.length && <span className="text-sm text-muted">Nenhum voucher criado.</span>}</div></article>
    </section>
    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Aquisição pública</h2><p className="mt-1 text-sm text-muted">Use a calculadora pública como conteúdo de captura e compartilhe a página personalizada da empresa.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="primary-button" href="/calculadora-retorno" target="_blank">Abrir calculadora de retorno</Link><Link className="secondary-button" href={`/agendar/${organization.slug}`} target="_blank">Ver página pública</Link></div></section>
  </div>;
}
