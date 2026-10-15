import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { appointments, professionals, clinicalAttachments, clinicalConsultationRecords, clinicalSummaryVersions, users } from "@/db/schema";
import { saveClinicalConsultation, saveClinicalSummary } from "@/actions/clinical-record";
import { uploadClinicalAttachment, reviewClinicalAttachment } from "@/actions/clinical-attachments";
import { requireClinicalClient } from "@/lib/clinical-access";
import type { ClinicalConsultationData } from "@/lib/clinical-record";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { hasOrganizationPermission } from "@/lib/permissions";
import { ActionForm } from "./action-form";
import { ClinicalApplications } from "./clinical-applications";

const vitalLabels: Record<string, string> = { weight: "Peso (kg)", height: "Altura (cm)", systolic: "Pressão sistólica (mmHg)", diastolic: "Pressão diastólica (mmHg)", heartRate: "Frequência cardíaca (bpm)", temperature: "Temperatura (°C)", oxygenSaturation: "Saturação de O₂ (%)" };
const labels = { subjective: "Queixa / objetivo e relato do paciente (S)", objective: "Exame / achados objetivos (O)", assessment: "Avaliação profissional (A)", plan: "Conduta e plano (P)", procedure: "Procedimento e técnica utilizados", intercurrences: "Intercorrências e providências", instructions: "Orientações ao paciente" };

/** Authorizes independently: callers cannot expose this server component to reception. */
export async function ClinicalWorkspace({ clientId, appointmentId, defaultMode = "aesthetic", summaryOnly = false, hideSummary = false }: { clientId: string; appointmentId?: string; defaultMode?: "medical" | "aesthetic"; summaryOnly?: boolean; hideSummary?: boolean }) {
  const { organization, session } = await requireClinicalClient(clientId);
  const canWrite = hasOrganizationPermission(organization.role, "clinical.manage");
  const [summaries, records, attachments, assigned] = await Promise.all([
    hideSummary ? Promise.resolve([]) : db.select({ record: clinicalSummaryVersions, author: users.name }).from(clinicalSummaryVersions).leftJoin(users, eq(users.id, clinicalSummaryVersions.authorUserId)).where(and(eq(clinicalSummaryVersions.organizationId, organization.id), eq(clinicalSummaryVersions.clientId, clientId))).orderBy(desc(clinicalSummaryVersions.createdAt), desc(clinicalSummaryVersions.id)).limit(10),
    summaryOnly ? Promise.resolve([]) : db.select({ record: clinicalConsultationRecords, author: users.name }).from(clinicalConsultationRecords).leftJoin(users, eq(users.id, clinicalConsultationRecords.authorUserId)).where(and(eq(clinicalConsultationRecords.organizationId, organization.id), eq(clinicalConsultationRecords.clientId, clientId), appointmentId ? eq(clinicalConsultationRecords.appointmentId, appointmentId) : undefined)).orderBy(desc(clinicalConsultationRecords.createdAt), desc(clinicalConsultationRecords.id)).limit(100),
    summaryOnly ? Promise.resolve([]) : db.select({ id: clinicalAttachments.id, title: clinicalAttachments.title, createdAt: clinicalAttachments.createdAt, reviewedAt: clinicalAttachments.reviewedAt, reviewer: users.name }).from(clinicalAttachments).leftJoin(users, eq(users.id, clinicalAttachments.reviewedByUserId)).where(and(eq(clinicalAttachments.organizationId, organization.id), eq(clinicalAttachments.clientId, clientId))).orderBy(desc(clinicalAttachments.createdAt)).limit(50),
    appointmentId && !summaryOnly ? db.select({ id: professionals.id }).from(appointments).innerJoin(professionals, and(eq(professionals.id, appointments.professionalId), eq(professionals.organizationId, organization.id))).where(and(eq(appointments.organizationId, organization.id), eq(appointments.clientId, clientId), eq(appointments.id, appointmentId), eq(professionals.userId, session.user.id), eq(professionals.isActive, true))).limit(1) : Promise.resolve([]),
  ]);
  const latest = summaries[0]; const data = latest?.record.data;
  return <div className="my-5 grid gap-5">
    {!hideSummary && <section className="panel"><h2 className="text-xl font-extrabold">Resumo clínico do paciente</h2>
      <p className="mt-2 text-sm text-muted">Informações revisadas pela equipe clínica. O resumo não é preenchido automaticamente a partir de respostas antigas.</p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><strong>Alergias: {data?.allergiesStatus === "reported" ? data.allergies : data?.allergiesStatus === "none_reported" ? "Nenhuma relatada na revisão" : "Não verificadas"}</strong>{data?.alerts && <p className="mt-2 whitespace-pre-wrap">Atenção: {data.alerts}</p>}</div>
      {data && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{([['medications', 'Medicamentos em uso'], ['conditions', 'Condições / problemas em acompanhamento'], ['history', 'Antecedentes relevantes']] as const).map(([key, label]) => <div key={key}><dt className="font-bold">{label}</dt><dd className="whitespace-pre-wrap">{data[key] || "Não informado"}</dd></div>)}</dl>}
      {latest && <p className="mt-3 text-xs text-muted">Última revisão: {formatOrganizationDateTime(latest.record.createdAt, organization.timezone)} · {latest.author ?? "Usuário registrado"}</p>}
      {canWrite && <details className="mt-4"><summary className="cursor-pointer font-bold text-brand">Revisar resumo com o paciente</summary><ActionForm key={latest?.record.id ?? "new"} action={saveClinicalSummary} successMessage="Nova revisão do resumo salva. A versão anterior foi preservada." className="mt-4 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="expectedVersion" value={latest?.record.id ?? ""} />
        <label className="grid gap-1 text-sm font-bold">Situação das alergias<select className="field" name="allergiesStatus" defaultValue={data?.allergiesStatus ?? "unknown"}><option value="unknown">Não verificadas</option><option value="none_reported">Nenhuma relatada</option><option value="reported">Alergias relatadas</option></select></label>
        {([['allergies', 'Alergias e reações relatadas'], ['medications', 'Medicamentos em uso'], ['conditions', 'Condições / problemas em acompanhamento'], ['history', 'Antecedentes relevantes'], ['alerts', 'Alertas para a equipe clínica']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-sm font-bold">{label}<textarea className="field min-h-20" name={key} defaultValue={data?.[key] ?? ""} maxLength={10000} /></label>)}
        <label className="flex gap-2 text-sm md:col-span-2"><input type="checkbox" name="reviewConfirmed" required />Revisei estas informações com o paciente ou responsável.</label><button className="primary-button w-fit">Salvar revisão do resumo</button>
      </ActionForm></details>}
      {summaries.length > 1 && <details className="mt-4"><summary className="cursor-pointer text-sm font-bold">Revisões anteriores recentes</summary>{summaries.slice(1).map(version => <details key={version.record.id} className="mt-2 rounded-xl border p-3"><summary className="cursor-pointer text-sm">{formatOrganizationDateTime(version.record.createdAt, organization.timezone)} · {version.author}</summary><p className="mt-2 whitespace-pre-wrap text-sm">{Object.entries(version.record.data).map(([key, value]) => `${({ allergiesStatus: "Situação das alergias", allergies: "Alergias", medications: "Medicamentos", conditions: "Condições", history: "Antecedentes", alerts: "Alertas" } as Record<string, string>)[key]}: ${key === "allergiesStatus" ? ({ unknown: "Não verificadas", none_reported: "Nenhuma relatada", reported: "Relatadas" } as Record<string, string>)[String(value)] : value || "Não informado"}`).join("\n")}</p></details>)}</details>}
    </section>}
    {!summaryOnly && <>
    {appointmentId && canWrite && !assigned.length && <p className="panel text-sm text-muted">Para finalizar a evolução, entre com o usuário vinculado ao profissional responsável por este atendimento.</p>}
    {appointmentId && canWrite && assigned.length > 0 && <section className="panel"><h2 className="text-xl font-extrabold">Finalizar registro clínico da consulta</h2><p className="mt-2 text-sm text-muted">O registro salvo será preservado. Correções posteriores devem ser feitas por adendo. Isto não altera a situação do agendamento nem representa assinatura digital qualificada.</p>
      <ActionForm key={records[0]?.record.id ?? "new-consultation"} action={saveClinicalConsultation} successMessage="Registro clínico finalizado e preservado no prontuário." className="mt-4 grid gap-4 md:grid-cols-2">
        <input type="hidden" name="appointmentId" value={appointmentId} /><input type="hidden" name="requestKey" value={randomUUID()} />
        <label className="grid gap-1 text-sm font-bold md:col-span-2">Tipo do registro<select className="field" name="mode" defaultValue={defaultMode}><option value="medical">Consulta médica particular</option><option value="aesthetic">Atendimento de estética</option></select></label>
        {Object.entries(labels).map(([name, label]) => <label className="grid gap-1 text-sm font-bold" key={name}>{label}<textarea className="field min-h-24" name={name} maxLength={10000} required={["subjective", "assessment", "plan"].includes(name)} /></label>)}
        <fieldset className="grid gap-3 md:col-span-2 sm:grid-cols-3"><legend className="mb-2 font-bold">Medidas e sinais vitais desta consulta</legend>{Object.entries(vitalLabels).map(([name, label]) => <label className="grid gap-1 text-sm" key={name}>{label}<input className="field" name={name} inputMode="decimal" /></label>)}</fieldset>
        <ClinicalApplications />
        <label className="grid gap-1 text-sm font-bold">Data de retorno sugerida<input className="field" type="date" name="followUpDate" /><span className="text-xs font-normal text-muted">Apenas registro clínico; não cria agendamento ou lembrete.</span></label>
        <label className="flex items-start gap-2 text-sm md:col-span-2"><input name="reviewConfirmed" type="checkbox" required />Revisei o conteúdo, as medidas e os produtos utilizados e confirmo a finalização deste registro.</label><button className="primary-button w-fit">Finalizar registro clínico</button>
      </ActionForm>
    </section>}
    <section className="panel"><h2 className="text-xl font-extrabold">Laudos e resultados de exames</h2><p className="mt-2 text-sm text-muted">PDFs privados do paciente, com indicação de revisão pela equipe clínica. Anexar um laudo não confirma a autenticidade ou assinatura do emissor.</p>
      {canWrite && <details className="mt-4"><summary className="cursor-pointer font-bold">Anexar laudo em PDF</summary>{process.env.SIGNATURE_STORAGE_KEYS ? <ActionForm action={uploadClinicalAttachment} successMessage="PDF anexado ao prontuário, aguardando revisão." className="mt-3 grid gap-3"><input name="clientId" type="hidden" value={clientId} /><label className="grid gap-1 text-sm">Identificação do exame / laudo<input className="field" name="title" required minLength={2} maxLength={150} /></label><label className="grid gap-1 text-sm">Arquivo PDF (até 3 MiB)<input className="field" type="file" name="file" accept="application/pdf,.pdf" required /></label><button className="primary-button w-fit">Anexar PDF privado</button></ActionForm> : <p className="mt-3 text-sm text-muted">O administrador precisa configurar o armazenamento privado de documentos para habilitar anexos.</p>}</details>}
      {!attachments.length && <p className="mt-4 text-sm text-muted">Nenhum laudo anexado.</p>}
      <p className="mt-3 text-xs text-muted">Exibindo até 50 anexos recentes.</p>
      {attachments.map(attachment => <article className="mt-3 rounded-xl border p-3" key={attachment.id}><p className="font-bold">{attachment.title}</p><p className="mt-1 text-xs text-muted">Anexado em {formatOrganizationDateTime(attachment.createdAt, organization.timezone)} · {attachment.reviewedAt ? `Revisado por ${attachment.reviewer ?? "usuário registrado"} em ${formatOrganizationDateTime(attachment.reviewedAt, organization.timezone)}` : "Revisão pendente"}</p><a className="secondary-button mt-3" href={`/api/clinical-attachments/${attachment.id}`}>Baixar PDF privado</a>{canWrite && !attachment.reviewedAt && <ActionForm action={reviewClinicalAttachment} successMessage="Revisão registrada." className="mt-3 grid gap-2"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="id" value={attachment.id} /><label className="flex gap-2 text-sm"><input name="confirmReview" type="checkbox" required />Li e revisei este documento.</label><button className="secondary-button w-fit">Registrar revisão</button></ActionForm>}</article>)}
    </section>
    <section className="panel"><h2 className="text-xl font-extrabold">Registros clínicos finalizados</h2><p className="mt-1 text-xs text-muted">Até 100 registros recentes. Medidas pertencem à consulta e não sobrescrevem o cadastro.</p>
      {!records.length && <p className="mt-4 text-sm text-muted">Nenhum registro estruturado finalizado. Anotações anteriores continuam no histórico.</p>}
      {records.map(({ record, author }) => <article key={record.id} className="mt-4 rounded-xl border p-4"><p className="text-sm font-bold">{record.kind === "addendum" ? "Adendo" : "Evolução finalizada"} · {author ?? "Usuário registrado"}</p><p className="text-xs text-muted">{formatOrganizationDateTime(record.createdAt, organization.timezone)}{record.parentRecordId ? ` · Vinculado ao registro ${record.parentRecordId.slice(0, 8)}` : ""}</p>
        {"addendum" in record.data ? <p className="mt-3 whitespace-pre-wrap text-sm">{record.data.addendum}</p> : <ClinicalRecordBody data={record.data} />}
        {!appointmentId && <Link href={`/atendimento/${record.appointmentId}`} className="mt-3 inline-block text-sm font-bold text-brand">Abrir atendimento</Link>}
        {canWrite && record.authorUserId === session.user.id && record.kind === "evolution" && <details className="mt-3"><summary className="cursor-pointer text-sm font-bold">Acrescentar adendo</summary><ActionForm action={saveClinicalConsultation} successMessage="Adendo registrado sem alterar o original." className="mt-3 grid gap-3"><input type="hidden" name="appointmentId" value={record.appointmentId} /><input type="hidden" name="parentRecordId" value={record.id} /><input type="hidden" name="requestKey" value={randomUUID()} /><label className="grid gap-1 text-sm">Complementação / correção<textarea className="field" name="addendum" minLength={2} maxLength={10000} required /></label><label className="flex gap-2 text-sm"><input name="reviewConfirmed" type="checkbox" required />Confirmo o adendo ao registro original.</label><button className="secondary-button w-fit">Registrar adendo</button></ActionForm></details>}
      </article>)}
    </section>
    </>}
  </div>;
}

function ClinicalRecordBody({ data }: { data: ClinicalConsultationData }) {
  return <div className="mt-3 grid gap-3 text-sm"><p className="font-bold">{data.mode === "medical" ? "Consulta médica particular" : "Atendimento de estética"}</p>{Object.entries(labels).map(([key, label]) => data[key as keyof typeof labels] ? <div key={key}><strong>{label}</strong><p className="whitespace-pre-wrap">{data[key as keyof typeof labels]}</p></div> : null)}
    <div className="flex flex-wrap gap-3">{Object.entries(data.vitals).filter(([, value]) => value != null).map(([key, value]) => <span key={key}>{vitalLabels[key]}: <strong>{value}</strong></span>)}</div>
    {data.applications.map((item, index) => <p className="rounded-xl border p-3" key={index}>{item.product} · lote {item.lot} · validade {item.expiresOn.split("-").reverse().join("/")} · {item.quantity} {item.unit}{item.region ? ` · ${item.region}` : ""}</p>)}
    {data.followUpDate && <p>Retorno sugerido: {data.followUpDate.split("-").reverse().join("/")}</p>}
  </div>;
}
