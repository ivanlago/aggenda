import { desc, eq } from "drizzle-orm";
import { Download, RefreshCcw, XCircle } from "lucide-react";
import Link from "next/link";

import { cancelElectronicDocument, createDocumentTemplate, issueElectronicDocument, resendElectronicDocument, setDocumentTemplateActive } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, documentTemplates, electronicDocuments } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Documentos e assinaturas" };

const typeLabels: Record<string, string> = { consent: "Consentimento", contract: "Contrato", anamnesis: "Anamnese", term: "Termo" };
const statusLabels: Record<string, string> = { pending: "Aguardando", viewed: "Visualizado", signed: "Assinado", refused: "Recusado", expired: "Expirado", cancelled: "Cancelado" };

export default async function DocumentsPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [templates, clientRows, rows] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)).orderBy(desc(documentTemplates.createdAt)),
    db.select({ id: clients.id, name: clients.name, email: clients.email }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ document: electronicDocuments, clientName: clients.name }).from(electronicDocuments).innerJoin(clients, eq(clients.id, electronicDocuments.clientId)).where(eq(electronicDocuments.organizationId, organization.id)).orderBy(desc(electronicDocuments.createdAt)).limit(100),
  ]);
  const activeTemplates = templates.filter((item) => item.isActive);

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos digitais" title="Documentos e assinaturas" description="Crie termos, contratos e anamneses, envie por e-mail e mantenha evidências auditáveis da assinatura." />
    <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-extrabold">Receitas e atestados</p><p className="mt-1">A emissão regulada será habilitada por integração ICP-Brasil contratada pela própria clínica ou profissional. O Aggenda não assume esse custo.</p></div>
    {canManage && <div className="grid gap-5 xl:grid-cols-2">
      <ActionForm action={createDocumentTemplate} successMessage="Modelo criado." className="panel form-stack">
        <h2 className="text-lg font-extrabold">Novo modelo</h2>
        <input className="field" name="name" required maxLength={120} placeholder="Nome interno do modelo" />
        <select className="field" name="documentType" defaultValue="consent"><option value="consent">Consentimento</option><option value="contract">Contrato</option><option value="anamnesis">Anamnese</option><option value="term">Termo</option></select>
        <input className="field" name="title" required maxLength={180} placeholder="Título exibido no documento" />
        <textarea className="field min-h-64" name="content" required maxLength={30000} placeholder={"Conteúdo integral. Variáveis disponíveis: {{cliente}}, {{clinica}} e {{data}}."} />
        <p className="text-xs text-muted">O conteúdo é congelado no momento do envio; alterações posteriores no modelo não mudam documentos já emitidos.</p>
        <button className="primary-button sm:w-fit">Criar modelo</button>
      </ActionForm>
      <ActionForm action={issueElectronicDocument} successMessage="Documento enviado para assinatura." className="panel form-stack">
        <h2 className="text-lg font-extrabold">Enviar para assinatura</h2>
        <select className="field" name="templateId" required defaultValue=""><option value="" disabled>Selecione o modelo</option>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · {typeLabels[item.documentType] ?? item.documentType}</option>)}</select>
        <select className="field" name="clientId" required defaultValue=""><option value="" disabled>Selecione o cliente/paciente</option>{clientRows.map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ""}</option>)}</select>
        <input className="field" name="signerName" placeholder="Nome do signatário (opcional; usa o cadastro)" />
        <input className="field" name="signerEmail" type="email" placeholder="E-mail (opcional; usa o cadastro)" />
        {!activeTemplates.length && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Crie ao menos um modelo ativo antes de emitir documentos.</p>}
        <button className="primary-button sm:w-fit" disabled={!activeTemplates.length || !clientRows.length}>Gerar e enviar por e-mail</button>
      </ActionForm>
    </div>}

    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Modelos</h2><div className="mt-4 divide-y">{templates.map((item) => <article className="flex items-center justify-between gap-4 py-3" key={item.id}><div><p className="font-bold">{item.name}</p><p className="text-xs text-muted">{typeLabels[item.documentType] ?? item.documentType} · {item.isActive ? "ativo" : "inativo"}</p></div>{canManage && <ActionForm action={setDocumentTemplateActive} successMessage="Modelo atualizado."><input type="hidden" name="id" value={item.id} /><input type="hidden" name="active" value={String(!item.isActive)} /><button className="secondary-button py-2">{item.isActive ? "Desativar" : "Ativar"}</button></ActionForm>}</article>)}{!templates.length && <p className="empty-state">Nenhum modelo criado.</p>}</div></section>

    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Documentos emitidos</h2><div className="mt-4 divide-y">{rows.map(({ document, clientName }) => <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center" key={document.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{document.title}</p><span className="status-pill">{statusLabels[document.status] ?? document.status}</span></div><p className="mt-1 text-xs text-muted">{clientName} · {document.signerEmail} · emitido em {document.createdAt.toLocaleString("pt-BR")}</p>{document.signedAt && <p className="mt-1 text-xs font-bold text-emerald-700">Assinado em {document.signedAt.toLocaleString("pt-BR")} · evidência {document.evidenceHash?.slice(0, 12)}…</p>}</div><div className="flex flex-wrap gap-2">{document.status === "signed" && <Link className="secondary-button py-2" href={`/api/documents/${document.id}/pdf`}><Download className="mr-2 size-4" />PDF assinado</Link>}{canManage && ["pending", "viewed", "expired"].includes(document.status) && <><ActionForm action={resendElectronicDocument} successMessage="Documento reenviado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2"><RefreshCcw className="mr-2 size-4" />Reenviar</button></ActionForm><ActionForm action={cancelElectronicDocument} successMessage="Documento cancelado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2 text-red-700"><XCircle className="mr-2 size-4" />Cancelar</button></ActionForm></>}</div></article>)}{!rows.length && <p className="empty-state">Nenhum documento emitido.</p>}</div></section>
  </div>;
}
