import { desc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import Link from "next/link";

import { updateCrmProposalStatus } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { crmLeads, crmOpportunities, crmProposals } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
export default async function CrmProposalsPage() {
  const { organization } = await requireOrganization();
  const proposals = await db.select({ id: crmProposals.id, number: crmProposals.number, title: crmProposals.title, status: crmProposals.status, total: crmProposals.totalInCents, validUntil: crmProposals.validUntil, createdAt: crmProposals.createdAt, leadId: crmLeads.id, leadName: crmLeads.name })
    .from(crmProposals).innerJoin(crmOpportunities, eq(crmOpportunities.id, crmProposals.opportunityId)).leftJoin(crmLeads, eq(crmLeads.id, crmOpportunities.leadId))
    .where(eq(crmProposals.organizationId, organization.id)).orderBy(desc(crmProposals.createdAt));
  return <div className="page-wrap"><Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/crm">← Voltar ao funil</Link><PageHeader eyebrow={organization.name} title="Propostas comerciais" description="Acompanhe envio, aceite e recusa sem gerar cobrança automática." />
    <div className="grid gap-4">{proposals.map((proposal) => <article className="panel" key={proposal.id}><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><FileText className="mt-1 size-5 text-brand" /><div><p className="text-xs font-bold text-muted">{proposal.number}</p><h2 className="font-extrabold">{proposal.title}</h2>{proposal.leadId && <Link className="text-sm text-brand" href={`/crm/leads/${proposal.leadId}`}>{proposal.leadName}</Link>}</div></div><div className="text-right"><p className="text-xl font-extrabold text-brand">{money(proposal.total)}</p><span className="status-pill">{proposal.status}</span></div></div>
      <div className="mt-4 flex flex-wrap gap-2">{proposal.status === "draft" && <ActionForm action={updateCrmProposalStatus} successMessage="Proposta marcada como enviada."><input type="hidden" name="proposalId" value={proposal.id} /><input type="hidden" name="status" value="sent" /><button className="secondary-button">Marcar como enviada</button></ActionForm>}{proposal.status === "sent" && <><ActionForm action={updateCrmProposalStatus} successMessage="Aceite registrado e oportunidade ganha."><input type="hidden" name="proposalId" value={proposal.id} /><input type="hidden" name="status" value="accepted" /><button className="primary-button">Registrar aceite</button></ActionForm><ActionForm action={updateCrmProposalStatus} successMessage="Recusa registrada."><input type="hidden" name="proposalId" value={proposal.id} /><input type="hidden" name="status" value="rejected" /><button className="secondary-button">Registrar recusa</button></ActionForm></>}</div>
    </article>)}{!proposals.length && <div className="panel empty-state">As propostas criadas nos leads aparecerão aqui.</div>}</div>
  </div>;
}
