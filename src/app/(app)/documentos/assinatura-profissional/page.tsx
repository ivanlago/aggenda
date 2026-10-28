import { ModalShell } from "@/components/modal-shell";
import { FormActions } from "@/components/form-dialog-context";
import { PaginatedCollection } from "@/components/paginated-collection";
import Link from "next/link";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { electronicDocuments, professionals, professionalSigningCeremonies, professionalSigningIdentities } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission, assertOrganizationPermission } from "@/lib/permissions";
import { localSignatureReadiness } from "@/lib/signatures/local-config";
import { PostgresSignatureRepository } from "@/lib/signatures/postgres-repository";
import { signatureDatabaseReady } from "@/lib/signatures/document-download";
import { bytesHash } from "@/lib/signatures/local-policy";
import { prepareProfessionalSignature, completeProfessionalSignature, cancelProfessionalSignature, registerProfessionalSigningIdentity, sendQualifiedDocumentToPatient } from "@/actions/professional-signatures";

export const metadata = { title: "Assinatura do profissional" };
export const maxDuration = 120;

export default async function ProfessionalSignaturePage({ searchParams }: { searchParams: Promise<{ documentId?: string; busca?: string }> }) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.sign");
  const { documentId, busca = "" } = await searchParams;
  const identitySearch = busca.trim().slice(0, 100);
  const ready = localSignatureReadiness(organization.id);
  const canManage = hasOrganizationPermission(organization.role, "team.manage");
  const schemaReady = await signatureDatabaseReady();
  const ownDocuments = !documentId ? await db.select({ id: electronicDocuments.id, title: electronicDocuments.title, createdAt: electronicDocuments.createdAt }).from(electronicDocuments)
    .innerJoin(professionals, and(eq(professionals.id, electronicDocuments.issuerProfessionalId), eq(professionals.organizationId, organization.id)))
    .where(and(eq(electronicDocuments.organizationId, organization.id), eq(professionals.userId, session.user.id), eq(electronicDocuments.workflowType, "professional_issue"), eq(electronicDocuments.status, "issued")))
    .orderBy(desc(electronicDocuments.createdAt)).limit(30) : [];
  const [document] = documentId && /^[a-f0-9-]{36}$/i.test(documentId) ? await db.select().from(electronicDocuments).where(and(
    eq(electronicDocuments.organizationId, organization.id), eq(electronicDocuments.id, documentId), eq(electronicDocuments.workflowType, "professional_issue"))).limit(1) : [];
  // The issuer restriction also applies to administrators: no impersonation.
  const [professional] = document?.issuerProfessionalId ? await db.select().from(professionals).where(and(
    eq(professionals.organizationId, organization.id), eq(professionals.id, document.issuerProfessionalId), eq(professionals.userId, session.user.id), eq(professionals.isActive, true))).limit(1) : [];
  const latest = schemaReady && document && professional ? await new PostgresSignatureRepository(db).latest(organization.id, document.id) : null;
  // Gate the new tables during rolling deployments; no access until migrations/config are ready.
  const [ceremony] = ready.ready && document && professional ? await db.select().from(professionalSigningCeremonies).where(and(
    eq(professionalSigningCeremonies.organizationId, organization.id), eq(professionalSigningCeremonies.documentId, document.id),
    eq(professionalSigningCeremonies.userId, session.user.id), or(eq(professionalSigningCeremonies.state, "open"), and(eq(professionalSigningCeremonies.state, "processing"), lt(professionalSigningCeremonies.processingStartedAt, sql`now() - interval '150 seconds'`)))))
    .orderBy(desc(professionalSigningCeremonies.createdAt)).limit(1) : [];
  const identityRows = ready.ready && canManage ? await db.select({ id: professionals.id, name: professionals.name, cpf: professionalSigningIdentities.cpf }).from(professionals)
    .leftJoin(professionalSigningIdentities, and(eq(professionalSigningIdentities.organizationId, organization.id), eq(professionalSigningIdentities.professionalId, professionals.id)))
    .where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).orderBy(professionals.name) : [];

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos" title="Assinatura do profissional" description="Assine receituários simples e solicitações de exames com seu certificado pessoal instalado no Windows." />
    <div className="panel mb-5" role="status"><p className="font-bold">{ready.message}</p><p className="mt-2 text-sm text-muted">O certificado e sua senha permanecem no computador do titular. O Aggenda recebe apenas a assinatura e os certificados públicos. Documentos sujeitos a controle especial não estão habilitados neste fluxo.</p></div>
    {!document ? <section className="panel"><h2 className="text-lg font-extrabold">Seus documentos emitidos</h2><PaginatedCollection label="Registros" className="mt-4 space-y-3">{ownDocuments.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><p>{item.title}</p><Link className="secondary-button" href={`/documentos/assinatura-profissional?documentId=${item.id}`}>Abrir assinatura</Link></div>)}{!ownDocuments.length && <p>Emita um receituário simples ou uma solicitação de exame no atendimento para iniciar.</p>}</PaginatedCollection></section> : !professional ? <section className="panel"><p>A assinatura deve ser realizada pelo usuário vinculado ao profissional responsável por este documento.</p></section> : <section className="panel form-stack">
      <h2 className="text-lg font-extrabold">{document.title}</h2><p className="text-sm text-muted">Profissional: {professional.name}</p>
      {latest?.status === "SIGNED" ? <div><p className="font-bold text-emerald-700" role="status">Assinatura ICP-Brasil validada e PDF preservado.</p><Link className="primary-button mt-4 inline-flex" href={`/api/documents/${document.id}/pdf`} target="_blank" rel="noopener noreferrer">Baixar PDF assinado</Link><ActionForm action={sendQualifiedDocumentToPatient} successMessage="Documento assinado enviado ao e-mail cadastrado do paciente." className="mt-3"><input type="hidden" name="documentId" value={document.id} /><button className="secondary-button">Enviar ao e-mail do paciente</button></ActionForm><p className="mt-3 text-sm"><a className="text-brand underline" href="https://validar.iti.gov.br" target="_blank" rel="noopener noreferrer">Conferir o arquivo no VALIDAR do ITI</a></p></div> : ready.ready ? <>
        {latest && <p className="text-sm">Solicitação anterior: {({ PENDING: "aguardando validação", FAILED: "não aprovada", CANCELLED: "cancelada" } as Record<string, string>)[latest.status]}.</p>}
        {!ceremony ? <ActionForm action={prepareProfessionalSignature} successMessage="PDF preparado e código enviado ao e-mail do profissional."><input type="hidden" name="documentId" value={document.id} /><button className="primary-button">Preparar assinatura e enviar código</button></ActionForm> : ceremony.sessionHash !== bytesHash(session.session.id) ? <div className="form-stack"><p>Esta autorização pertence a um acesso anterior. Cancele-a e prepare novamente neste acesso.</p><ActionForm action={cancelProfessionalSignature} successMessage="Autorização cancelada."><input type="hidden" name="documentId" value={document.id} /><input type="hidden" name="ceremonyId" value={ceremony.id} /><button className="secondary-button">Cancelar autorização anterior</button></ActionForm></div> : <>
          <ol className="list-decimal space-y-3 pl-5 text-sm"><li>Baixe e revise o PDF preparado, que contém a versão exata a assinar.</li><li>Abra o assinador Aggenda no Windows, escolha seu e-CPF e autorize a assinatura do arquivo.</li><li>Anexe abaixo o arquivo .p7s produzido pelo assinador e informe o código enviado ao seu e-mail.</li></ol>
          <a className="secondary-button w-fit" href={`/api/documents/${document.id}/signature/prepared?ceremony=${ceremony.id}`}>Baixar PDF preparado</a>
          <a className="secondary-button w-fit" href="/api/signatures/windows">Baixar assinador para Windows</a>
          <p className="break-all text-xs text-muted">SHA-256: {ceremony.originalHash}</p>
          <p className="text-sm">Autorização válida até {ceremony.expiresAt.toLocaleString("pt-BR", { timeZone: organization.timezone })}.</p>
          {(ceremony.expiresAt <= new Date() || ceremony.attempts >= 5) && <p className="font-bold text-amber-800">Autorização expirada ou sem tentativas disponíveis. Cancele esta autorização e prepare uma nova assinatura.</p>}
          <ActionForm action={completeProfessionalSignature} successMessage="Assinatura validada. O PDF assinado está disponível para download." className="form-stack" resetOnSuccess={false}>
            <input type="hidden" name="documentId" value={document.id} /><input type="hidden" name="ceremonyId" value={ceremony.id} />
            <label className="grid gap-2 text-sm font-bold">Arquivo de assinatura (.p7s)<input className="field" type="file" name="cms" accept=".p7s" required /></label>
            <label className="grid gap-2 text-sm font-bold">Código recebido por e-mail<input className="field" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
            <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" required />Conferi o conteúdo do PDF e autorizo minha assinatura neste documento.</label>
            <button className="primary-button w-fit" disabled={ceremony.expiresAt <= new Date() || ceremony.attempts >= 5}>Validar e concluir assinatura</button>
          </ActionForm>
          <ActionForm action={cancelProfessionalSignature} successMessage="Autorização cancelada."><input type="hidden" name="documentId" value={document.id} /><input type="hidden" name="ceremonyId" value={ceremony.id} /><button className="secondary-button">Cancelar esta autorização</button></ActionForm>
        </>}
      </> : null}
    </section>}
    {ready.ready && canManage && <section className="panel mt-5"><h2 className="text-lg font-extrabold">Identidade dos profissionais</h2><p className="mt-2 text-sm text-muted">Confira o CPF com o titular e o cadastro profissional antes de autorizar. Cada profissional deve ter seu próprio usuário e CRM/UF cadastrados.</p><form method="get" className="mt-4 flex flex-wrap gap-3">{documentId && <input type="hidden" name="documentId" value={documentId} />}<label className="grid gap-1 text-sm font-bold">Buscar profissional<input className="field" name="busca" defaultValue={identitySearch} /></label><button className="secondary-button self-end">Buscar</button></form><PaginatedCollection label="Identidade dos profissionais" className="mt-4 space-y-4">{identityRows.filter(item => item.name.toLocaleLowerCase("pt-BR").includes(identitySearch.toLocaleLowerCase("pt-BR"))).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><p className="font-bold">{item.name} · {item.cpf ? "Identidade cadastrada" : "CPF pendente"}</p><ModalShell title={`Conferir identidade: ${item.name}`} triggerLabel="Conferir identidade" variant="edit" closeOnSuccess><ActionForm action={registerProfessionalSigningIdentity} successMessage="Identidade registrada." className="form-stack"><p className="font-bold">{item.name}{item.cpf ? ` · CPF cadastrado com final ${item.cpf.slice(-2)}` : " · CPF pendente"}</p><input type="hidden" name="professionalId" value={item.id} /><label className="grid gap-2 text-sm">CPF do profissional<input className="field" name="cpf" inputMode="numeric" maxLength={14} required autoComplete="off" /></label><label className="flex gap-2 text-sm"><input type="checkbox" name="verified" required />Conferi a identidade e o vínculo deste CPF ao profissional.</label><FormActions submitLabel="Registrar identidade conferida" /></ActionForm></ModalShell></div>)}</PaginatedCollection></section>}
  </div>;
}
