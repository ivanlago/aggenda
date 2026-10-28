import Link from "next/link";
import { hasOrganizationPermission } from "@/lib/permissions";
import { PaginatedCollection } from "@/components/paginated-collection";
import { usesInternalWhatsAppAgent } from "@/lib/whatsapp-message";
import { and, eq } from "drizzle-orm";
import { Bot, CheckCircle2, MessageCircleMore, Sparkles, Workflow } from "lucide-react";

import { WhatsAppConnectButton } from "@/components/whatsapp-connect-button";
import { db } from "@/db";
import { organizationUsageCounters, whatsappChannels } from "@/db/schema";
import { getOrganizationServicePlan, whatsappServices } from "@/lib/service-plans";
import { requireOrganization } from "@/lib/session";
import { formatPhone } from "@/lib/phone";

const firstDayOfMonth = () => { const now = new Date(); return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`; };

async function loadAutomationSettings() {
  const { organization } = await requireOrganization();
  const [plan, channels, usage] = await Promise.all([
    getOrganizationServicePlan(organization.id),
    db.select().from(whatsappChannels).where(eq(whatsappChannels.organizationId, organization.id)),
    db.select().from(organizationUsageCounters).where(and(eq(organizationUsageCounters.organizationId, organization.id), eq(organizationUsageCounters.periodStart, firstDayOfMonth()))),
  ]);
  const current = whatsappServices[plan.whatsappServiceCode];
  const metrics = new Map(usage.map((item) => [item.metric, item.quantity]));
  const received = metrics.get("whatsapp.inbound") ?? 0; const sent = metrics.get("whatsapp.outbound") ?? 0; const aiCalls = metrics.get("ai.calls") ?? 0;
  const activeChannel = channels.some((channel) => channel.isActive && channel.connectionStatus === "active");
  const templatesReady = [process.env.META_TEMPLATE_APPOINTMENT_CONFIRMATION, process.env.META_TEMPLATE_APPOINTMENT_RESCHEDULE, process.env.META_TEMPLATE_APPOINTMENT_CANCELLATION, process.env.META_TEMPLATE_APPOINTMENT_REMINDER].every(Boolean);
  const internalAgentReady = Boolean(process.env.AGGENDA_INTERNAL_API_URL && process.env.AGGENDA_INTERNAL_API_KEY);
  const workflowUrls: Record<string, string | undefined> = { CHAT: process.env.N8N_CHAT_WEBHOOK_URL, CHAT_AI: undefined, CORE: process.env.N8N_CORE_WEBHOOK_URL, CORE_AI: undefined };
  const channelReady = !current.usesCloudApi || activeChannel;
  const workflowReady = !current.workflowProduct || (usesInternalWhatsAppAgent(current.workflowProduct) ? internalAgentReady : Boolean(workflowUrls[current.workflowProduct]));
  return { canManageBilling: hasOrganizationPermission(organization.role, "billing.manage"), plan, channels, current, received, sent, aiCalls, channelReady, templatesReady, workflowReady, serviceReady: channelReady && (!current.usesCloudApi || templatesReady) && workflowReady };
}

export async function WhatsAppSettingsContent() {
  const data = await loadAutomationSettings();
  data.channels.forEach((channel) => { channel.displayPhoneNumber = formatPhone(channel.displayPhoneNumber) || null; });
  return <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)]">
    <article className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-extrabold uppercase tracking-widest text-brand">Serviço atual</p><h2 className="mt-2 text-2xl font-extrabold">{data.current.name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{data.current.description}</p></div><span className="status-pill">{data.serviceReady ? "Pronto" : data.plan.isLegacyFallback ? "Acesso legado" : "Configuração pendente"}</span></div>
      <div className={`mt-5 rounded-xl p-3 text-sm font-bold ${data.serviceReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{data.serviceReady ? "Serviço pronto para uso." : <>Configuração incompleta: {!data.channelReady && "conecte um canal Meta ativo; "}{data.current.usesCloudApi && !data.templatesReady && "configure os templates transacionais; "}{!data.workflowReady && "configure o processamento contratado."}</>}</div>
      <dl className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2"><div><dt className="text-sm font-bold">Inteligência artificial</dt><dd className="mt-1 text-sm text-muted">{data.current.usesAi ? "Habilitada nesta modalidade" : "Esta modalidade funciona sem IA"}</dd></div><div><dt className="text-sm font-bold">Envio pelo WhatsApp</dt><dd className="mt-1 text-sm text-muted">{data.current.usesCloudApi ? "Pelo canal empresarial conectado" : "Envio manual pelo profissional"}</dd></div></dl>
      <div className="mt-6 grid gap-3 sm:grid-cols-4"><Metric icon={MessageCircleMore} value={data.received} label="recebidas no mês" /><Metric icon={MessageCircleMore} value={data.sent} label="enviadas no mês" /><Metric icon={Sparkles} value={data.aiCalls} label="chamadas de IA" /><Metric icon={Workflow} value={data.channels.filter((item) => item.isActive && item.connectionStatus === "active").length} label="canais conectados e ativos" /></div>
      <p className="mt-5 text-sm text-muted">Consulte as franquias e os adicionais em Administração → Assinaturas.{data.canManageBilling && <> <Link href="/assinatura" className="font-bold text-brand underline">Ver minhas assinaturas</Link></>}</p>
    </article>
    <aside className="panel"><Bot className="size-6 text-brand" /><h2 className="mt-5 text-xl font-extrabold">Canais cadastrados</h2>{data.channels.length === 0 ? <><p className="mt-3 text-sm leading-6 text-muted">Nenhum número oficial conectado. Escolha o número empresarial e confirme o código recebido.</p>{data.current.usesCloudApi ? <WhatsAppConnectButton appId={process.env.NEXT_PUBLIC_META_APP_ID} configurationId={process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIGURATION_ID} /> : <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">O WhatsApp Assistido não precisa conectar um número à API.</p>}</> : <PaginatedCollection label="Registros" className="mt-4 grid gap-3">{data.channels.map((channel) => <div className="rounded-xl border p-3" key={channel.id}><p className="font-bold">{channel.displayPhoneNumber ?? "Número configurado"}</p><p className="mt-1 flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="size-3 text-brand" />{channel.connectionStatus === "active" && channel.isActive ? "Conectado e ativo" : !channel.isActive ? "Desativado" : "Conexão pendente"}</p></div>)}</PaginatedCollection>}{data.channels.length > 0 && !data.channelReady && <div className="mt-4"><p className="mb-3 text-sm text-amber-800">Há números cadastrados, mas nenhum canal conectado e ativo. Conclua a conexão para receber mensagens.</p><WhatsAppConnectButton appId={process.env.NEXT_PUBLIC_META_APP_ID} configurationId={process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIGURATION_ID} /></div>}{!data.serviceReady && <p className="mt-4 text-sm text-muted">{!data.workflowReady || !data.templatesReady ? "Solicite à equipe de suporte a ativação do processamento e a validação dos modelos de mensagem do serviço contratado." : "Conclua a conexão do número empresarial acima."}</p>}</aside>
  </section>;
}


function Metric({ icon: Icon, value, label }: { icon: typeof MessageCircleMore; value: number; label: string }) { return <div className="rounded-2xl bg-[#f3f5f1] p-4"><Icon className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{value}</p><p className="text-xs text-muted">{label}</p></div>; }
