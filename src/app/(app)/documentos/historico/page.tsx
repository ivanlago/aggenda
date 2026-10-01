import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Download, RefreshCcw, XCircle } from "lucide-react";
import Link from "next/link";

import { cancelElectronicDocument, resendElectronicDocument } from "@/actions/electronic-documents";
import { reviewAnamnesis } from "@/actions/anamnesis";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, electronicDocuments, professionals } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { isAnamnesisSchema, type AnamnesisAnswers } from "@/lib/anamnesis";

export const metadata = { title: "Histórico" };
const typeLabels: Record<string, string> = { consent: "Consentimento", contract: "Contrato", anamnesis: "Anamnese", term: "Termo", prescription: "Receituário", report: "Relatório", certificate: "Atestado", declaration: "Declaração", referral: "Encaminhamento", exam_request: "Solicitação de exame", guidance: "Orientações", companion_declaration: "Declaração de acompanhante", quote: "Orçamento" };
const statusLabels: Record<string, string> = { pending: "Aguardando", viewed: "Visualizado", signed: "Assinado", issued: "Emitido", refused: "Recusado", expired: "Expirado", cancelled: "Cancelado" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const { organization } = await requireOrganization();
 const params = await searchParams;
 const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
 const q = value("q").trim().slice(0, 180), type = value("type"), status = value("status");
 const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : "";
 const start = validDate(value("start")), end = validDate(value("end"));
 const page = Math.max(1, Math.min(100000, Number.parseInt(value("page"), 10) || 1));
 const conditions = [eq(electronicDocuments.organizationId, organization.id)];
 if (typeLabels[type]) conditions.push(eq(electronicDocuments.documentType, type));
 if (statusLabels[status]) conditions.push(eq(electronicDocuments.status, status as typeof electronicDocuments.$inferSelect.status));
 if (q) conditions.push(or(ilike(clients.name, `%${q}%`), ilike(electronicDocuments.title, `%${q}%`))!);
 if (start) conditions.push(sql`(${electronicDocuments.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${organization.timezone})::date >= ${start}::date`);
 if (end) conditions.push(sql`(${electronicDocuments.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${organization.timezone})::date <= ${end}::date`);
 const canManage = hasOrganizationPermission(organization.role, "documents.manage");
 const [results, professionalRows] = await Promise.all([
 db.select({ document: electronicDocuments, clientName: clients.name }).from(electronicDocuments).innerJoin(clients, eq(clients.id, electronicDocuments.clientId)).where(and(...conditions)).orderBy(desc(electronicDocuments.createdAt), desc(electronicDocuments.id)).limit(51).offset((page - 1) * 50),
 db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
 ]);
 const rows = results.slice(0, 50);
 const pageUrl = (next: number) => `/documentos/historico?${new URLSearchParams({ q, type, status, start, end, page: String(next) })}`;
 return <div className="page-wrap">
 <PageHeader eyebrow="Documentos" title="Histórico" description="Consulte documentos e acompanhe emissões e assinaturas." />
 <form className="panel grid gap-3 md:grid-cols-3" method="get">
 <label className="grid gap-1 text-sm font-bold">Paciente ou título<input className="field" name="q" defaultValue={q} placeholder="Buscar documentos" /></label>
 <label className="grid gap-1 text-sm font-bold">Tipo<select className="field" name="type" defaultValue={type}><option value="">Todos os tipos</option>{Object.entries(typeLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
 <label className="grid gap-1 text-sm font-bold">Situação<select className="field" name="status" defaultValue={status}><option value="">Todas as situações</option>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
 <label className="grid gap-1 text-sm font-bold">Emitido de<input className="field" type="date" name="start" defaultValue={start} max={end || undefined} /></label>
 <label className="grid gap-1 text-sm font-bold">Até<input className="field" type="date" name="end" defaultValue={end} min={start || undefined} /></label>
 <div className="flex items-end gap-2"><button className="primary-button">Buscar</button><Link className="secondary-button" href="/documentos/historico">Limpar</Link></div>
 </form>
    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Documentos emitidos</h2><div className="mt-4 divide-y">{rows.map(({ document, clientName }) => { const answers = document.structuredData?.answers as AnamnesisAnswers | undefined; const schema = document.structuredData?.schema; const reviewedAt = document.structuredData?.reviewedAt as string | undefined; const alerts = isAnamnesisSchema(schema) && answers ? schema.filter((field) => field.alertWhen && String(answers[field.id] ?? "") === field.alertWhen) : []; return <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center" key={document.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{document.title}</p><span className="status-pill">{statusLabels[document.status] ?? document.status}</span>{reviewedAt ? <span className="status-pill">Revisada</span> : null}{alerts.length ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-900">{alerts.length} alerta(s)</span> : null}</div><p className="mt-1 text-xs text-muted">{clientName} · {typeLabels[document.documentType] ?? document.documentType} · emitido em {document.createdAt.toLocaleString("pt-BR", { timeZone: organization.timezone })}</p>{document.signedAt && <p className="mt-1 text-xs font-bold text-emerald-700">Assinado em {document.signedAt.toLocaleString("pt-BR", { timeZone: organization.timezone })} · evidência {document.evidenceHash?.slice(0, 12)}…</p>}{document.documentType === "anamnesis" && document.signerResponses ? <details className="mt-2"><summary className="cursor-pointer text-sm font-extrabold text-brand">Revisar respostas</summary><pre className="mt-2 whitespace-pre-wrap rounded-xl border bg-slate-50 p-3 font-sans text-sm leading-6">{document.signerResponses}</pre></details> : null}</div><div className="flex flex-wrap gap-2">{["signed", "issued"].includes(document.status) && <Link className="secondary-button py-2" href={`/api/documents/${document.id}/pdf`}><Download className="mr-2 size-4" />{document.status === "issued" ? "Baixar/Imprimir PDF" : "PDF assinado"}</Link>}{canManage && document.documentType === "anamnesis" && document.status === "signed" && !reviewedAt ? <ActionForm action={reviewAnamnesis} successMessage="Anamnese revisada e vinculada ao prontuário."><input type="hidden" name="id" value={document.id} /><select className="field py-2" name="professionalId" required defaultValue={document.issuerProfessionalId ?? ""}><option value="" disabled>Profissional revisor</option>{professionalRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="primary-button mt-2 py-2">Confirmar revisão</button></ActionForm> : null}{canManage && ["pending", "viewed", "expired"].includes(document.status) && <><ActionForm action={resendElectronicDocument} successMessage="Documento reenviado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2"><RefreshCcw className="mr-2 size-4" />Reenviar</button></ActionForm><ActionForm action={cancelElectronicDocument} successMessage="Documento cancelado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2 text-red-700"><XCircle className="mr-2 size-4" />Cancelar</button></ActionForm></>}</div></article>; })}{!rows.length && <p className="empty-state">Nenhum documento emitido.</p>}</div></section>
<nav aria-label="Páginas do histórico" className="mt-4 flex items-center gap-3">{page > 1 && <Link className="secondary-button" href={pageUrl(page - 1)}>Anterior</Link>}<span className="text-sm">Página {page}</span>{results.length > 50 && <Link className="secondary-button" href={pageUrl(page + 1)}>Próxima</Link>}</nav></div>;
}
