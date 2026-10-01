import { and, eq } from "drizzle-orm";
import Link from "next/link";

import { createDocumentTemplate, duplicateDocumentTemplate, issueElectronicDocument, setDocumentTemplateActive, updateDocumentTemplate } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { DeleteDocumentTemplateForm } from "@/components/delete-document-template-form";
import { LegalDocumentComposer } from "@/components/legal-document-composer";
import { legalKey } from "@/lib/legal-documents";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, documentTemplates, organizations, professionals, professionalRegistrations, services } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireDocumentOrganization } from "@/lib/document-session";


const allowedTypes = new Set(["consent", "contract", "term"]);
const typeLabels: Record<string, string> = { consent: "Consentimento", contract: "Contrato", term: "Termo" };

export async function TermsPage({ legal = false }: { legal?: boolean } = {}) {
  const { organization } = await requireDocumentOrganization();
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [allTemplates, clientRows, professionalRows, registrations, procedureRows, clinicRows] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)).orderBy(documentTemplates.name),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone, cpf: clients.cpf, address: clients.address }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).orderBy(professionals.name),
    db.select().from(professionalRegistrations).where(eq(professionalRegistrations.organizationId, organization.id)),
    db.select({ id: services.id, name: services.name, description: services.description, preparation: services.preparation, durationMinutes: services.durationMinutes, priceInCents: services.priceInCents }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select({ name: organizations.name, legalName: organizations.legalName, taxId: organizations.taxId, publicAddress: organizations.publicAddress, phone: organizations.phone, publicEmail: organizations.publicEmail }).from(organizations).where(eq(organizations.id, organization.id)).limit(1),
  ]);
  const templates = allTemplates.filter((item) => allowedTypes.has(item.documentType) && item.workflowType === "patient_signature");
  const activeTemplates = templates.filter((item) => item.isActive);
  const automaticTemplates = activeTemplates.filter(item => legalKey(item.responseSchema));
  const manualTemplates = activeTemplates.filter(item => !legalKey(item.responseSchema));
  const professionalOptions = professionalRows.map(item => ({ ...item, registration: registrations.filter(reg => reg.professionalId === item.id).map(reg => `${reg.council} ${reg.registrationNumber}/${reg.state}`).join("; ") }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos para assinatura" title={legal ? "Jurídicos" : "Termos e contratos"} description="Envie consentimentos, termos e contratos para assinatura eletrônica do paciente." />
    <div className="mb-5 flex justify-end">
      <Link className="secondary-button" href="/documentos/historico">Ver documentos emitidos</Link>
    </div>

    {canManage && automaticTemplates.length > 0 && clinicRows[0] && <LegalDocumentComposer templates={automaticTemplates.map(({ id, name, title, content, responseSchema }) => ({ id, name, title, content, responseSchema }))} clients={clientRows} professionals={professionalOptions} procedures={procedureRows} organization={clinicRows[0]} today={today} />}
    {canManage && manualTemplates.length > 0 && <details className="panel mt-5"><summary className="cursor-pointer font-extrabold">Enviar modelo personalizado para assinatura</summary><ActionForm action={issueElectronicDocument} successMessage="Documento enviado para assinatura." className="form-stack mt-4"><label className="grid gap-1 text-sm font-bold">Modelo<select className="field" name="templateId" required defaultValue=""><option value="" disabled>Selecione o modelo</option>{manualTemplates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Paciente<select className="field" name="clientId" required defaultValue=""><option value="" disabled>Selecione o paciente</option>{clientRows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><input className="field" name="signerName" placeholder="Nome do signatário (usa o cadastro se não informado)" /><input className="field" name="signerEmail" type="email" placeholder="E-mail para assinatura (usa o cadastro se não informado)" /><button className="primary-button w-fit">Gerar e enviar por e-mail</button></ActionForm></details>}
    {!canManage && <p className="empty-state">Seu perfil possui acesso somente para consulta de documentos.</p>}

    {canManage ? <section className="panel form-stack mt-5">
      <div><p className="eyebrow">Novo conteúdo</p><h2 className="text-xl font-extrabold">Criar modelo personalizado</h2><p className="mt-1 text-sm text-muted">O novo modelo ficará disponível imediatamente na lista de envio acima.</p></div>
      <ActionForm action={createDocumentTemplate} successMessage="Modelo criado e adicionado à lista de envio." className="grid gap-3">
        <input className="field" name="name" required maxLength={120} placeholder="Nome interno do modelo" />
        <select className="field" name="documentType" defaultValue="consent"><option value="consent">Consentimento</option><option value="contract">Contrato</option><option value="term">Termo</option></select>
        <input className="field" name="title" required maxLength={180} placeholder="Título exibido no documento" />
        <textarea className="field min-h-64" name="content" required maxLength={30000} placeholder="Conteúdo integral do documento" />
        <p className="text-xs text-muted">Variáveis disponíveis: {"{{cliente}}"}, {"{{clinica}}"}, {"{{profissional}}"} e {"{{data}}"}.</p>
        <button className="primary-button w-fit">Criar e disponibilizar modelo</button>
      </ActionForm>
    </section> : null}

    <section className="panel mt-5"><div><h2 className="text-xl font-extrabold">Modelos de termos e contratos</h2><p className="mt-1 text-sm text-muted">Modelos nativos são protegidos. Duplique um deles para criar uma versão adaptada.</p></div><div className="mt-4 divide-y">{templates.map((item) => <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-start" key={item.id}>
      <div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{item.name}</p>{item.isSystemPreset ? <span className="status-pill">Nativo</span> : null}</div><p className="text-xs text-muted">{typeLabels[item.documentType]} · {item.isActive ? "ativo" : "inativo"}</p>{canManage && !item.isSystemPreset ? <details className="mt-3"><summary className="cursor-pointer text-sm font-extrabold text-brand">Editar modelo</summary><ActionForm action={updateDocumentTemplate} successMessage="Modelo atualizado." className="mt-3 grid gap-2 rounded-xl border p-3"><input type="hidden" name="id" value={item.id} /><input className="field" name="name" defaultValue={item.name} required /><input className="field" name="title" defaultValue={item.title} required /><textarea className="field min-h-48" name="content" defaultValue={item.content} required /><button className="primary-button w-fit">Salvar conteúdo</button></ActionForm></details> : null}</div>
      {canManage ? item.isSystemPreset ? <ActionForm action={duplicateDocumentTemplate} successMessage="Cópia criada e pronta para personalização."><input type="hidden" name="id" value={item.id} /><button className="secondary-button py-2">Duplicar e personalizar</button></ActionForm> : <div className="flex flex-wrap gap-2"><ActionForm action={setDocumentTemplateActive} successMessage="Modelo atualizado."><input type="hidden" name="id" value={item.id} /><input type="hidden" name="active" value={String(!item.isActive)} /><button className="secondary-button py-2">{item.isActive ? "Desativar" : "Ativar"}</button></ActionForm><DeleteDocumentTemplateForm id={item.id} name={item.name} /></div> : null}
    </article>)}{!templates.length ? <p className="empty-state">Nenhum modelo disponível.</p> : null}</div></section>
  </div>;
}
