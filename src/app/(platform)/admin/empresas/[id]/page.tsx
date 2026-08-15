import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { startSupportSession } from "@/actions/access";
import { updateOrganizationServicePlan } from "@/actions/service-plans";
import { ActionForm } from "@/components/action-form";
import { db } from "@/db";
import {
  clients,
  organizationMembers,
  organizationFinancialIntegrations,
  organizations,
  services,
  supportSessions,
  users,
} from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";
import {
  corePlanCodes,
  corePlans,
  getOrganizationServicePlan,
  nfseServiceCodes,
  nfseServices,
  whatsappServiceCodes,
  whatsappServices,
} from "@/lib/service-plans";

function maskPhone(value: string | null) {
  if (!value) return "—";
  return value.length > 4 ? `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : "••••";
}

export default async function CompanyAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { platform } = await requirePlatformMember();
  const { id } = await params;
  const [[organization], members, clientItems, serviceItems, activeSupport, servicePlan, [nfseIntegration]] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, id)).limit(1),
    db.select({ name: users.name, email: users.email, role: organizationMembers.role }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, id)),
    db.select({ id: clients.id, name: clients.name, phone: clients.phone, email: clients.email }).from(clients).where(eq(clients.organizationId, id)).limit(100),
    db.select({ id: services.id, name: services.name, isActive: services.isActive }).from(services).where(eq(services.organizationId, id)).limit(100),
    db.select().from(supportSessions).where(and(eq(supportSessions.organizationId, id), isNull(supportSessions.endedAt))).limit(10),
    getOrganizationServicePlan(id),
    db.select({ status: organizationFinancialIntegrations.status, environment: organizationFinancialIntegrations.environment, metadata: organizationFinancialIntegrations.metadata, updatedAt: organizationFinancialIntegrations.updatedAt }).from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, id), eq(organizationFinancialIntegrations.provider, "nfse"))).limit(1),
  ]);
  if (!organization) notFound();
  const canStartSupport = ["super_admin", "support", "operations"].includes(platform.role);
  const canManagePlans = ["super_admin", "billing", "operations"].includes(platform.role);
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Empresa</p>
      <h1 className="mt-2 text-3xl font-extrabold">{organization.name}</h1>
      <p className="mt-2 text-muted">{organization.slug} · {organization.businessType ?? "segmento não informado"}</p>
      {canStartSupport && <form action={startSupportSession} className="panel mt-6 grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <input type="hidden" name="organizationId" value={id} />
        <input className="field" name="reason" minLength={10} required placeholder="Motivo detalhado do atendimento de suporte" />
        <select className="field" name="accessLevel" defaultValue="read_only"><option value="read_only">Somente leitura</option>{platform.role === "super_admin" && <option value="operational">Operacional</option>}</select>
        <button className="primary-button">Iniciar sessão de 1 hora</button>
      </form>}
      {activeSupport.length > 0 && <p className="mt-3 text-sm font-bold text-amber-700">Existem {activeSupport.length} sessões de suporte registradas para esta empresa.</p>}
      {nfseIntegration?.status === "requested" && <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">Ação necessária</p><h2 className="mt-2 text-xl font-extrabold text-amber-950">Ativação de NFS-e solicitada</h2><p className="mt-2 text-sm leading-6 text-amber-900">Confirme valores e compatibilidade com a prefeitura antes de orientar a empresa a inserir a credencial fiscal. Solicitação atualizada em {nfseIntegration.updatedAt.toLocaleString("pt-BR")}.</p></section>}
      <section className="panel mt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Produtos habilitados</p>
            <h2 className="mt-2 text-xl font-extrabold">{corePlans[servicePlan.corePlanCode].name} + {whatsappServices[servicePlan.whatsappServiceCode].name}</h2>
            {servicePlan.isLegacyFallback && <p className="mt-2 text-sm text-amber-700">Acesso legado preservado. Salve uma configuração para aplicar limites explícitos.</p>}
          </div>
        </div>
        {canManagePlans && <ActionForm action={updateOrganizationServicePlan} successMessage="Serviços da empresa atualizados." className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="organizationId" value={id} />
          <label className="grid gap-2 text-sm font-bold">Plano Core<select className="field" name="corePlanCode" defaultValue={servicePlan.corePlanCode}>{corePlanCodes.map((code) => <option key={code} value={code}>{corePlans[code].name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold">Serviço de WhatsApp<select className="field" name="whatsappServiceCode" defaultValue={servicePlan.whatsappServiceCode}>{whatsappServiceCodes.map((code) => <option key={code} value={code}>{whatsappServices[code].name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold">Franquia WhatsApp<input className="field" type="number" min="0" name="whatsappMonthlyLimit" defaultValue={servicePlan.whatsappMonthlyLimit} /><span className="text-xs font-normal text-muted">0 mantém sem limite</span></label>
          <label className="grid gap-2 text-sm font-bold">Franquia de IA<input className="field" type="number" min="0" name="aiMonthlyLimit" defaultValue={servicePlan.aiMonthlyLimit} /><span className="text-xs font-normal text-muted">0 mantém sem limite</span></label>
          <label className="grid gap-2 text-sm font-bold">Serviço de NFS-e<select className="field" name="nfseServiceCode" defaultValue={servicePlan.nfseServiceCode}>{nfseServiceCodes.map((code) => <option key={code} value={code}>{nfseServices[code].name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold">Franquia mensal NFS-e<input className="field" type="number" min="0" name="nfseMonthlyLimit" defaultValue={servicePlan.nfseMonthlyLimit} /></label>
          <label className="grid gap-2 text-sm font-bold">Excedente NFS-e (centavos)<input className="field" type="number" min="0" name="nfseOverageInCents" defaultValue={servicePlan.nfseOverageInCents} /></label>
          <label className="grid gap-2 text-sm font-bold">Mensalidade NFS-e (centavos)<input className="field" type="number" min="0" name="nfseMonthlyPriceInCents" defaultValue={servicePlan.nfseMonthlyPriceInCents} /></label>
          <button className="primary-button md:col-span-2 xl:col-span-4 xl:w-fit">Salvar produtos e limites</button>
        </ActionForm>}
      </section>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="panel"><h2 className="text-xl font-extrabold">Equipe</h2><div className="mt-4 divide-y">{members.map((member) => <div className="py-3" key={member.email}><p className="font-bold">{member.name}</p><p className="text-sm text-muted">{member.email} · {member.role}</p></div>)}</div></section>
        <section className="panel"><h2 className="text-xl font-extrabold">Serviços</h2><div className="mt-4 divide-y">{serviceItems.map((service) => <div className="flex justify-between py-3" key={service.id}><span className="font-bold">{service.name}</span><span className="text-sm text-muted">{service.isActive ? "ativo" : "inativo"}</span></div>)}</div></section>
        <section className="panel lg:col-span-2"><h2 className="text-xl font-extrabold">Clientes finais</h2><p className="mt-1 text-xs text-muted">Dados de contato mascarados no suporte global.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{clientItems.map((client) => <div className="rounded-xl border p-3" key={client.id}><p className="font-bold">{client.name}</p><p className="text-sm text-muted">{maskPhone(client.phone)} · {client.email ? client.email.replace(/(^.).*(@.*$)/, "$1•••$2") : "sem e-mail"}</p></div>)}</div></section>
      </div>
    </div>
  );
}
