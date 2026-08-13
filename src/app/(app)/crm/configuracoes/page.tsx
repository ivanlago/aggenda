import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { createCrmCustomField } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { crmCustomFields, crmPipelines, crmStages } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export default async function CrmSettingsPage() {
  const { organization } = await requireOrganization();
  const [pipelines, stages, fields] = await Promise.all([db.select().from(crmPipelines).where(eq(crmPipelines.organizationId, organization.id)), db.select().from(crmStages).where(eq(crmStages.organizationId, organization.id)).orderBy(asc(crmStages.position)), db.select().from(crmCustomFields).where(eq(crmCustomFields.organizationId, organization.id)).orderBy(asc(crmCustomFields.name))]);
  return <div className="page-wrap"><Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/crm">← Voltar ao funil</Link><PageHeader eyebrow={organization.name} title="Configurações do CRM" description="Estruture dados próprios do negócio sem alterar o cadastro padrão." />
    <section className="grid gap-5 lg:grid-cols-2"><article className="panel"><h2 className="text-xl font-extrabold">Funis e etapas</h2>{pipelines.map((pipeline) => <div className="mt-4" key={pipeline.id}><p className="font-bold">{pipeline.name}</p><div className="mt-2 flex flex-wrap gap-2">{stages.filter((stage) => stage.pipelineId === pipeline.id).map((stage) => <span className="status-pill" key={stage.id}>{stage.position}. {stage.name}</span>)}</div></div>)}</article>
    <article className="panel"><h2 className="text-xl font-extrabold">Campos personalizados</h2><ActionForm action={createCrmCustomField} successMessage="Campo criado." className="mt-4 grid gap-3"><input className="field" name="name" required placeholder="Ex.: Unidade de interesse" /><select className="field" name="fieldType" defaultValue="text"><option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option><option value="select">Lista de opções</option></select><input className="field" name="options" placeholder="Opções separadas por vírgula" /><button className="primary-button">Criar campo</button></ActionForm><div className="mt-4 divide-y">{fields.map((field) => <p className="py-3 text-sm" key={field.id}><strong>{field.name}</strong> · {field.fieldType}</p>)}</div></article></section>
  </div>;
}
