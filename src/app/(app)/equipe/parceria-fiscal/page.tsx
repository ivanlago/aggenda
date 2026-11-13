import { and, eq, gte, lte, desc } from "drizzle-orm";
import Link from "next/link";
import { updatePartnershipDocuments, voidPartnershipAllocation } from "@/actions/partnership-allocations";
import { MemberPartnershipForm } from "@/components/member-partnership-form";
import { PartnershipAllocationForm } from "@/components/partnership-allocation-form";
import { PaginatedCollection } from "@/components/paginated-collection";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { financialEntries, professionalFiscalAllocations, professionalFiscalPartnerships, professionalFiscalShares, professionals, services } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { partnershipPending, readPartnershipContract } from "@/lib/partnership-compliance";
import { organizationDate } from "@/lib/appointment-safety";
import { FiscalShareForm } from "./fiscal-share-form";

const path = "/equipe/parceria-fiscal";
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const validDay = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
};

export default async function PartnershipPage({ searchParams }: { searchParams: Promise<{ profissional?: string; de?: string; ate?: string }> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.manage")) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão financeira.</p></div>;
  const query = await searchParams;
  const people = await db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).orderBy(professionals.name);
  const selected = people.find(person => person.id === query.profissional);
  const [partner] = selected ? await db.select().from(professionalFiscalPartnerships).where(and(eq(professionalFiscalPartnerships.professionalId, selected.id), eq(professionalFiscalPartnerships.organizationId, organization.id))).limit(1) : [];
  const today = organizationDate(new Date(), organization.timezone);
  const from = validDay(query.de) ? query.de! : today.slice(0, 8) + "01";
  const to = validDay(query.ate) && query.ate! >= from ? query.ate! : new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [catalog, saved, receipts, allocations] = await Promise.all([
    selected ? db.select({ id: services.id, name: services.name, priceInCents: services.priceInCents }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name) : [],
    partner ? db.select().from(professionalFiscalShares).where(eq(professionalFiscalShares.professionalId, partner.professionalId)) : [],
    partner ? db.select({ id: financialEntries.id, description: financialEntries.description, amount: financialEntries.amountInCents, realizedDate: financialEntries.realizedDate }).from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.type, "receivable"), eq(financialEntries.status, "received"), gte(financialEntries.realizedDate, from), lte(financialEntries.realizedDate, to))).orderBy(desc(financialEntries.realizedDate)) : [],
    selected ? db.select({ allocation: professionalFiscalAllocations, receiptStatus: financialEntries.status }).from(professionalFiscalAllocations).innerJoin(financialEntries, and(eq(financialEntries.id, professionalFiscalAllocations.financialEntryId), eq(financialEntries.organizationId, organization.id))).where(and(eq(professionalFiscalAllocations.organizationId, organization.id), eq(professionalFiscalAllocations.professionalId, selected.id), gte(professionalFiscalAllocations.receivedOn, from), lte(professionalFiscalAllocations.receivedOn, to))).orderBy(desc(professionalFiscalAllocations.receivedOn), desc(professionalFiscalAllocations.createdAt)) : [],
  ]);
  const serviceOptions = catalog.map(service => ({ ...service, saved: saved.find(rule => rule.serviceId === service.id)?.percentageBasisPoints ?? null, suggestion: null }));
  const pending = partnershipPending(readPartnershipContract(partner?.contract), today);
  const totals = allocations.filter(row => !row.allocation.voidedAt && row.receiptStatus === "received").reduce((sum, { allocation: row }) => ({ gross: sum.gross + row.grossInCents, salon: sum.salon + row.salonInCents, partner: sum.partner + row.partnerInCents, tax: sum.tax + row.withheldInCents }), { gross: 0, salon: 0, partner: 0, tax: 0 });
  return <div className="page-wrap grid gap-4">
    <PageHeader eyebrow="" title="Profissional parceiro" description="" />
    <section className="panel grid gap-3">
      <form action={path} className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm font-bold">Profissional<select className="field" name="profissional" defaultValue={selected?.id ?? ""} required><option value="">Selecione</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button className="primary-button">Abrir cadastro</button></form>
      {selected && <MemberPartnershipForm key={selected.id} professionalId={selected.id} partner={partner} />}
      <Link href="/equipe" className="text-sm font-bold text-brand">Voltar à equipe</Link>
    </section>
    {selected && <section className="panel grid gap-3"><h2 className="font-extrabold">Cotas-partes por serviço</h2><p className="text-sm text-muted">Use o percentual do contrato, independente da comissão comercial. A simulação não emite nota nem gera lançamentos.</p><FiscalShareForm key={partner?.professionalId ?? "simulacao"} professionalId={partner?.professionalId} services={serviceOptions} /></section>}
    {partner && <>
      <section className="panel grid gap-3">
        <form action={path} className="flex flex-wrap items-end gap-3"><input name="profissional" type="hidden" value={partner.professionalId} /><label className="grid gap-1 text-sm font-bold">De<input className="field" type="date" name="de" defaultValue={from} required /></label><label className="grid gap-1 text-sm font-bold">Até<input className="field" type="date" name="ate" defaultValue={to} min={from} required /></label><button className="primary-button">Consultar período</button></form>
        <p className="text-sm font-bold">Recebido apurado: {money(totals.gross)} · Cota da clínica: {money(totals.salon)} · Cota do parceiro: {money(totals.partner)} · Retenções: {money(totals.tax)} · Líquido a repassar: {money(totals.partner - totals.tax)}</p>
        <p className="text-xs text-muted">Demonstrativo auxiliar, separado das comissões. Não gera novo lançamento financeiro, pagamento ou recolhimento de imposto e não altera o DRE. Notas e repasses devem ser conferidos com a contabilidade.</p>
      </section>
      <section className="panel grid gap-3"><h2 className="font-extrabold">Registrar apuração de recebimento</h2>
        {pending.length > 0 && <p className="text-sm text-amber-800">Pendências documentais na data de hoje: {pending.join("; ")}. A vigência será conferida novamente na data do recebimento.</p>}
        <PartnershipAllocationForm key={`${partner.professionalId}-${from}-${to}`} professionalId={partner.professionalId} receipts={receipts} services={serviceOptions.filter(item => item.saved !== null).map(item => ({ id: item.id, name: item.name, rate: item.saved! }))} />
      </section>
      <section className="panel grid gap-3"><h2 className="font-extrabold">Apurações e documentos fiscais</h2><p className="text-sm text-muted">Identifique a nota ao consumidor e a nota do parceiro para o salão. Informar a referência não emite nem valida a nota. A emissão integrada do regime ainda depende da homologação fiscal dos conectores.</p>
        <PaginatedCollection label="Apurações da parceria">{allocations.length ? allocations.map(({ allocation: row, receiptStatus }) => <article className="border-b py-3" key={row.id}>
          <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{row.receivedOn} · {row.snapshot.serviceName} · {money(row.grossInCents)}</strong><span>{row.voidedAt ? "Estornada" : receiptStatus !== "received" ? "Recebimento alterado: revisar/estornar" : !row.consumerInvoice || !row.partnerInvoice ? "Documentos pendentes" : "Referências fiscais registradas"}</span></div>
          <p className="text-sm">CNPJ parceiro: {row.snapshot.cnpj} · Percentual: {row.percentageBasisPoints / 100}% · Clínica: {money(row.salonInCents)} · Parceiro: {money(row.partnerInCents)} · Retenções: {money(row.withheldInCents)} · Líquido: {money(row.partnerInCents - row.withheldInCents)}</p>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-bold text-brand">Documentos e memória da apuração</summary><div className="mt-2 grid gap-3">
            <p className="text-xs text-muted">Contrato: {row.snapshot.contract.reference} · Homologação: {row.snapshot.contract.homologatedOn} · {row.snapshot.contract.authority} · Protocolo: {row.snapshot.contract.protocol}. Retenções: {row.withholdingDescription || "Não informadas"}.</p>
            <p className="text-sm">Discriminação para conferência da nota: serviço {row.snapshot.serviceName}; total {money(row.grossInCents)}; cota-parte do salão {money(row.salonInCents)}; cota-parte do profissional {money(row.partnerInCents)}; CNPJ do parceiro {row.snapshot.cnpj}.</p>
            {row.voidedAt ? <p className="text-sm">Motivo do estorno: {row.voidReason}</p> : <>
              <ActionForm action={updatePartnershipDocuments} successMessage="Referências fiscais atualizadas." resetOnSuccess={false} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><input type="hidden" name="id" value={row.id} /><label className="grid gap-1 text-sm font-bold">Nota ao consumidor<input className="field" name="consumerInvoice" defaultValue={row.consumerInvoice} maxLength={240} /></label><label className="grid gap-1 text-sm font-bold">Nota do parceiro ao salão<input className="field" name="partnerInvoice" defaultValue={row.partnerInvoice} maxLength={240} /></label><button className="primary-button">Salvar referências</button></ActionForm>
              <ActionForm action={voidPartnershipAllocation} successMessage="Apuração estornada; o histórico foi preservado." className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={row.id} /><label className="grid flex-1 gap-1 text-sm font-bold">Motivo do estorno<input className="field" name="reason" required minLength={5} maxLength={500} /></label><button className="secondary-button">Estornar apuração</button></ActionForm>
            </>}
          </div></details>
        </article>) : <p className="empty-state text-sm text-muted">Nenhuma apuração no período.</p>}</PaginatedCollection>
      </section>
    </>}
  </div>;
}
