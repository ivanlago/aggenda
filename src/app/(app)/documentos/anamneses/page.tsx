import { and, eq } from "drizzle-orm";

import { createAnamnesisTemplate, issueAnamnesis } from "@/actions/anamnesis";
import { ActionForm } from "@/components/action-form";
import { AnamnesisTemplateBuilder } from "@/components/anamnesis-template-builder";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, documentTemplates, professionals, services } from "@/db/schema";
import { isAnamnesisSchema } from "@/lib/anamnesis";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Anamnese" };

export default async function AnamnesisPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [templates, clientRows, professionalRows, procedureRows] = await Promise.all([
    db.select().from(documentTemplates).where(and(eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.documentType, "anamnesis"))),
    db.select({ id: clients.id, name: clients.name, email: clients.email }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
    db.select({ id: services.id, name: services.name, shortName: services.shortName }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
  ]);
  const activeTemplates = templates.filter((item) => item.isActive && isAnamnesisSchema(item.responseSchema));

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos clínicos" title="Anamnese" description="Envie a ficha ao paciente ou abra o preenchimento presencial no dispositivo da clínica." />
    {!canManage ? <p className="empty-state">Seu perfil possui acesso somente para consulta de documentos.</p> : activeTemplates.length ? <ActionForm action={issueAnamnesis} successMessage="Anamnese criada." className="panel form-stack">
      <div><h2 className="text-xl font-extrabold">Emitir anamnese</h2><p className="mt-1 text-sm text-muted">O Aggenda inclui dois modelos nativos: Anamnese clínica geral e Anamnese estética geral. Modelos personalizados criados abaixo também aparecerão nesta lista.</p></div>
      <label className="grid gap-1 text-sm font-bold">Modelo<select className="field" name="templateId" required defaultValue=""><option value="" disabled>Selecione o modelo</option>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-bold">Paciente<select className="field" name="clientId" required defaultValue=""><option value="" disabled>Selecione o paciente</option>{clientRows.map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ""}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-bold">Profissional responsável<select className="field" name="professionalId" defaultValue=""><option value="">Definir durante a revisão</option>{professionalRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-bold">Forma de preenchimento<select className="field" name="delivery" defaultValue="email"><option value="email">Enviar link e código por e-mail</option><option value="fill_now">Preencher agora neste dispositivo</option></select></label>
      <button className="primary-button w-fit">Iniciar anamnese</button>
    </ActionForm> : <div className="panel"><p className="text-sm font-bold text-amber-900">Nenhum modelo estruturado de anamnese está disponível. Solicite ao administrador da plataforma a revisão dos modelos nativos desta organização.</p></div>}
    {canManage ? <section className="panel form-stack mt-5">
      <div><p className="eyebrow">Personalização</p><h2 className="text-xl font-extrabold">Criar modelo de anamnese</h2><p className="mt-1 text-sm text-muted">Monte um novo questionário com campos, condições e alertas próprios. Depois de salvo, ele ficará disponível no seletor “Modelo” do formulário de emissão acima.</p></div>
      <details><summary className="cursor-pointer text-sm font-extrabold text-brand">Abrir criador de modelo personalizado</summary><ActionForm action={createAnamnesisTemplate} successMessage="Modelo criado e adicionado à lista de envio." className="mt-4 grid gap-3"><AnamnesisTemplateBuilder services={procedureRows} /><button className="primary-button w-fit">Salvar e disponibilizar modelo</button></ActionForm></details>
    </section> : null}
  </div>;
}
