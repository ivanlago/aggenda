import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { saveFiscalPartnership } from "@/actions/professional-fiscal-partnership";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { commissionRules, professionalFiscalPartnerships, professionalFiscalShares, professionals, services } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { FiscalShareForm } from "./fiscal-share-form";

const path = "/equipe/parceria-fiscal";

export default async function PartnershipPage({ searchParams }: { searchParams: Promise<{ profissional?: string }> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.manage")) {
    return <div className="page-wrap"><p className="panel">Acesso restrito à gestão financeira.</p></div>;
  }

  const query = await searchParams;
  const people = await db.select({ id: professionals.id, name: professionals.name }).from(professionals)
    .where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).orderBy(professionals.name);
  const selected = people.find(person => person.id === query.profissional);
  const [partner] = selected ? await db.select().from(professionalFiscalPartnerships).where(and(
    eq(professionalFiscalPartnerships.professionalId, selected.id),
    eq(professionalFiscalPartnerships.organizationId, organization.id),
  )).limit(1) : [];

  const [catalog, saved, rules] = partner ? await Promise.all([
    db.select({ id: services.id, name: services.name, priceInCents: services.priceInCents }).from(services)
      .where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select().from(professionalFiscalShares).where(eq(professionalFiscalShares.professionalId, partner.professionalId)),
    db.select({ serviceId: commissionRules.serviceId, type: commissionRules.calculationType, value: commissionRules.value })
      .from(commissionRules).where(and(eq(commissionRules.organizationId, organization.id),
        eq(commissionRules.professionalId, partner.professionalId), eq(commissionRules.isActive, true),
        inArray(commissionRules.sourceType, ["service", "appointment"]))),
  ]) : [[], [], []];

  const serviceOptions = catalog.map(service => {
    const specific = rules.filter(rule => rule.serviceId === service.id);
    const applicable = specific.length ? specific : rules.filter(rule => rule.serviceId === null);
    const candidate = applicable[0];
    const suggestion = candidate?.type === "percentage" && applicable.every(rule => rule.type === candidate.type && rule.value === candidate.value)
      ? candidate.value : null;
    return { ...service, saved: saved.find(rule => rule.serviceId === service.id)?.percentageBasisPoints ?? null, suggestion };
  });

  return <div className="page-wrap grid gap-4">
    <PageHeader eyebrow="Equipe" title="Profissional parceiro" description="Cadastre a parceria fiscal e simule a divisão do valor de um serviço avulso." />
    <section className="panel grid gap-3">
      <h2 className="font-extrabold">Cadastro fiscal</h2>
      <form action={path} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-bold">Profissional
          <select className="field" name="profissional" defaultValue={selected?.id ?? ""} required>
            <option value="">Selecione</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <button className="secondary-button">Abrir cadastro</button>
      </form>
      {selected && <ActionForm key={selected.id} action={saveFiscalPartnership} successMessage="Cadastro fiscal salvo." resetOnSuccess={false} className="grid gap-3">
        <input type="hidden" name="professionalId" value={selected.id} />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="active" defaultChecked={partner?.isActive ?? true} /> Profissional parceiro
        </label>
        <label className="grid gap-1 text-sm font-bold">CPF (opcional)
          <input className="field" name="cpf" inputMode="numeric" maxLength={18} defaultValue={partner?.cpf ?? ""} />
        </label>
        <label className="grid gap-1 text-sm font-bold">CNPJ do parceiro
          <input className="field" name="cnpj" maxLength={20} defaultValue={partner?.cnpj ?? ""} required />
        </label>
        <div><button className="primary-button">Salvar cadastro fiscal</button></div>
      </ActionForm>}
      <Link href="/equipe" className="text-sm font-bold text-brand">Voltar à equipe</Link>
    </section>
    <section className="panel grid gap-3">
      <h2 className="font-extrabold">Simular cota-parte</h2>
      <p className="text-sm text-muted">Use o valor do serviço e o percentual do contrato. A simulação não emite nota nem gera lançamentos.</p>
      <FiscalShareForm key={partner?.professionalId ?? "simulacao"} professionalId={partner?.professionalId} services={serviceOptions} />
    </section>
  </div>;
}
