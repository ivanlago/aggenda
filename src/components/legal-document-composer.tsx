"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { issueElectronicDocument, saveLegalProcedureDefaults } from "@/actions/electronic-documents";
import { legalDefinitions, legalKey, legalFieldValues, legalContextValues, renderLegalDocument, type LegalClient, type LegalProfessional, type LegalService, type LegalOrganization } from "@/lib/legal-documents";

type Template = { id: string; name: string; title: string; content: string; responseSchema: unknown };
export function LegalDocumentComposer({ templates, clients, professionals, procedures, organization, today }: { templates: Template[]; clients: LegalClient[]; professionals: LegalProfessional[]; procedures: LegalService[]; organization: LegalOrganization; today: string }) {
 const [templateId, setTemplateId] = useState(templates.find(item => legalKey(item.responseSchema) === "contract")?.id ?? templates[0]?.id ?? "");
 const [clientId, setClientId] = useState("");
 const [professionalId, setProfessionalId] = useState("");
 const [serviceId, setServiceId] = useState("");
 const [fields, setFields] = useState<Record<string, string>>({ sessions: "1", startDate: today });
 const [preview, setPreview] = useState<string | null>(null);
 const [error, setError] = useState("");
 const template = templates.find(item => item.id === templateId);
 const definition = legalDefinitions.find(item => item.key === legalKey(template?.responseSchema));
 const client = clients.find(item => item.id === clientId);
 const professional = professionals.find(item => item.id === professionalId);
 const service = procedures.find(item => item.id === serviceId);
 function populate(nextTemplate: Template | undefined, nextService: LegalService | undefined) {
 const nextDefinition = legalDefinitions.find(item => item.key === legalKey(nextTemplate?.responseSchema));
 const meta = Array.isArray(nextTemplate?.responseSchema) ? nextTemplate.responseSchema.find(item => item.kind === "legal_document") : undefined;
 const defaults = meta?.defaultsByService?.[nextDefinition?.procedure ? nextService?.id ?? "" : "organization"] ?? {};
 const next: Record<string, string> = {};
 for (const field of nextDefinition?.fields ?? []) next[field.id] = defaults[field.id] ?? (field.id === "sessions" ? "1" : field.source === "price" && nextService?.priceInCents != null ? (nextService.priceInCents / 100).toFixed(2) : field.source === "description" ? nextService?.description ?? "" : field.source === "preparation" ? nextService?.preparation ?? "" : field.id === "privacyContact" ? organization.publicEmail || organization.phone || "" : field.type === "date" && field.id === "startDate" ? today : "");
 setFields(next); setPreview(null); setError("");
 }
 function showPreview() {
 if (!template || !definition || !client || (definition.procedure && (!service || !professional))) { setError("Selecione o cliente, o procedimento e o profissional aplicáveis."); return; }
 try { const values = legalFieldValues(definition, fields); setPreview(renderLegalDocument(template.content, { ...legalContextValues(organization, client, professional, service, today.split("-").reverse().join("/")), ...values })); setError(""); } catch (failure) { setError(failure instanceof Error ? failure.message : "Revise os campos."); }
 }
 return <section className="panel form-stack"><div><h2 className="text-xl font-extrabold">Gerar documento jurídico</h2><p className="mt-1 text-sm text-muted">Os dados cadastrais serão preenchidos automaticamente. Revise os campos específicos antes de enviar para assinatura.</p></div>
 <ActionForm action={issueElectronicDocument} successMessage="Documento criado e enviado para assinatura." className="form-stack" onSuccess={() => setPreview(null)}>
 <input type="hidden" name="legalFields" value={JSON.stringify(fields)} />
 <div className="grid gap-3 md:grid-cols-2">
 <label className="grid gap-1 text-sm font-bold">Documento<select className="field" name="templateId" value={templateId} onChange={event => { setTemplateId(event.target.value); populate(templates.find(item => item.id === event.target.value), service); }} required>{templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
 <label className="grid gap-1 text-sm font-bold">Paciente<select className="field" name="clientId" value={clientId} onChange={event => { setClientId(event.target.value); setPreview(null); }} required><option value="" disabled>Selecione o paciente</option>{clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
 <label className="grid gap-1 text-sm font-bold">Profissional<select className="field" name="professionalId" value={professionalId} onChange={event => { setProfessionalId(event.target.value); setPreview(null); }} required={definition?.procedure}><option value="">{definition?.procedure ? "Selecione o profissional" : "Não se aplica"}</option>{professionals.map(item => <option key={item.id} value={item.id}>{item.name}{item.registration ? ` · ${item.registration}` : ""}</option>)}</select></label>
 {definition?.procedure && <label className="grid gap-1 text-sm font-bold">Procedimento<select className="field" name="serviceId" value={serviceId} onChange={event => { setServiceId(event.target.value); populate(template, procedures.find(item => item.id === event.target.value)); }} required><option value="" disabled>Selecione o procedimento</option>{procedures.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
 </div>
 {client && <p className="rounded-xl bg-slate-50 p-3 text-sm">Paciente: {client.name} · CPF: {client.cpf || "não cadastrado"} · E-mail: {client.email || "não cadastrado"}<br />Clínica: {organization.legalName || organization.name} · CPF/CNPJ: {organization.taxId || "não cadastrado"}</p>}
 <div className="grid gap-3 md:grid-cols-2">{definition?.fields.map(field => <label key={field.id} className={`grid gap-1 text-sm font-bold ${field.type === "textarea" ? "md:col-span-2" : ""}`}>{field.label}{field.type === "textarea" ? <textarea className="field min-h-24" required={field.required} maxLength={5000} value={fields[field.id] ?? ""} onChange={event => { setFields(current => ({ ...current, [field.id]: event.target.value })); setPreview(null); }} /> : <input className="field" type={field.type === "money" || field.type === "number" ? "number" : field.type || "text"} step={field.type === "money" ? "0.01" : field.type === "number" ? "1" : undefined} min={field.type === "money" ? "0" : field.type === "number" ? "1" : undefined} required={field.required} maxLength={5000} value={fields[field.id] ?? ""} onChange={event => { setFields(current => ({ ...current, [field.id]: event.target.value })); setPreview(null); }} />}</label>)}</div>
 {fields.sessions && fields.unitPrice && <p className="text-sm font-bold">Total calculado: {(Math.round(Number(fields.unitPrice) * 100) * Number(fields.sessions) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}
 {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
 <button type="button" className="primary-button w-fit" onClick={showPreview}>Visualizar documento</button>
 {preview && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="legal-preview-title"><div className="my-6 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><h2 id="legal-preview-title" className="text-xl font-extrabold">{template?.title}</h2><button type="button" className="rounded-xl p-2" aria-label="Fechar pré-visualização" onClick={() => setPreview(null)}><X className="size-5" /></button></div><div className="my-5 whitespace-pre-wrap rounded-xl border p-5 text-sm leading-7">{preview}</div><label className="grid gap-1 text-sm font-bold">Nome do signatário<input className="field" name="signerName" defaultValue={definition?.key === "guardian" ? fields.guardianName : client?.name} required /></label><label className="mt-3 grid gap-1 text-sm font-bold">E-mail para assinatura<input className="field" name="signerEmail" type="email" defaultValue={definition?.key === "guardian" ? "" : client?.email ?? ""} required /></label><button className="primary-button mt-4">Gerar e enviar para assinatura</button></div></div>}
 </ActionForm>
 {definition && (serviceId || !definition.procedure) && <ActionForm action={saveLegalProcedureDefaults} successMessage="Padrão salvo para os próximos documentos." className="flex flex-wrap items-center gap-3"><input type="hidden" name="templateId" value={templateId} /><input type="hidden" name="serviceId" value={definition.procedure ? serviceId : ""} /><input type="hidden" name="legalFields" value={JSON.stringify(fields)} /><button className="secondary-button">{definition.procedure ? "Salvar padrão para este procedimento" : "Salvar padrão da clínica"}</button><p className="text-xs text-muted">Salva somente textos e condições reutilizáveis, sem dados do paciente.</p></ActionForm>}
 </section>;
}
