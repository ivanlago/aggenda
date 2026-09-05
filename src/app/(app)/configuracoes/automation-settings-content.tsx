import { and, eq } from "drizzle-orm";
import { Bot, CheckCircle2, MessageCircleMore, Sparkles, Workflow } from "lucide-react";

import { WhatsAppConnectButton } from "@/components/whatsapp-connect-button";
import { db } from "@/db";
import { organizationUsageCounters, whatsappChannels } from "@/db/schema";
import { getOrganizationServicePlan, whatsappServiceCodes, whatsappServices } from "@/lib/service-plans";
import { requireOrganization } from "@/lib/session";

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
  const workflowUrls: Record<string, string | undefined> = { CHAT: process.env.N8N_CHAT_WEBHOOK_URL, CHAT_AI: process.env.N8N_CHAT_AI_WEBHOOK_URL, CORE: process.env.N8N_CORE_WEBHOOK_URL, CORE_AI: undefined };
  const channelReady = !current.usesCloudApi || activeChannel;
  const workflowReady = !current.workflowProduct || (current.workflowProduct === "CORE_AI" ? internalAgentReady : Boolean(workflowUrls[current.workflowProduct]));
  return { plan, channels, current, received, sent, aiCalls, channelReady, templatesReady, workflowReady, serviceReady: channelReady && (!current.usesCloudApi || templatesReady) && workflowReady };
}

export async function WhatsAppSettingsContent() {
  const data = await loadAutomationSettings();
  return <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
    <article className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-extrabold uppercase tracking-widest text-brand">Serviço atual</p><h2 className="mt-2 text-2xl font-extrabold">{data.current.name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{data.current.description}</p></div><span className="status-pill">{data.serviceReady ? "Pronto" : data.plan.isLegacyFallback ? "Acesso legado" : "Configuração pendente"}</span></div>
      <div className={`mt-5 rounded-xl p-3 text-sm font-bold ${data.serviceReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{data.serviceReady ? "Serviço pronto para uso." : <>Configuração incompleta: {!data.channelReady && "conecte um canal Meta ativo; "}{data.current.usesCloudApi && !data.templatesReady && "configure os templates transacionais; "}{!data.workflowReady && "configure o processamento contratado."}</>}</div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4"><Metric icon={MessageCircleMore} value={data.received} label="recebidas no mês" /><Metric icon={MessageCircleMore} value={data.sent} label="enviadas no mês" /><Metric icon={Sparkles} value={data.aiCalls} label="chamadas de IA" /><Metric icon={Workflow} value={data.channels.filter((item) => item.isActive).length} label="canais ativos" /></div>
      <div className="mt-5 grid gap-2 text-sm"><p><strong>Franquia WhatsApp:</strong> {data.plan.whatsappMonthlyLimit === 0 ? "sem limite configurado" : `${data.plan.whatsappMonthlyLimit}/mês`}</p><p><strong>Franquia de IA:</strong> {data.plan.aiMonthlyLimit === 0 ? "sem limite configurado" : `${data.plan.aiMonthlyLimit}/mês`}</p></div>
    </article>
    <aside className="panel"><Bot className="size-6 text-brand" /><h2 className="mt-5 text-xl font-extrabold">Canal conectado</h2>{data.channels.length === 0 ? <><p className="mt-3 text-sm leading-6 text-muted">Nenhum número oficial conectado. Escolha o número empresarial e confirme o código recebido.</p>{data.current.usesCloudApi ? <WhatsAppConnectButton appId={process.env.NEXT_PUBLIC_META_APP_ID} configurationId={process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIGURATION_ID} /> : <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">O WhatsApp Assistido não precisa conectar um número à API.</p>}</> : <div className="mt-4 grid gap-3">{data.channels.map((channel) => <div className="rounded-xl border p-3" key={channel.id}><p className="font-bold">{channel.displayPhoneNumber ?? "Número configurado"}</p><p className="mt-1 flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="size-3 text-brand" />{channel.connectionStatus === "active" && channel.isActive ? "Ativo" : "Pendente"}</p></div>)}</div>}</aside>
  </section>;
}

export async function AutomationAndAiSettingsContent() {
  const data = await loadAutomationSettings();
  return <section><div className="mb-5"><h2 className="text-xl font-extrabold">Automações e inteligência artificial</h2><p className="mt-2 text-sm text-muted">Confira as modalidades disponíveis e a configuração atualmente contratada.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{whatsappServiceCodes.map((code) => { const service = whatsappServices[code]; const active = code === data.plan.whatsappServiceCode; return <article className={`panel ${active ? "ring-2 ring-brand/20" : ""}`} key={code}><div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">{service.name}</h3>{active && <span className="status-pill">Atual</span>}</div><p className="mt-3 text-sm leading-6 text-muted">{service.description}</p><div className="mt-5 flex gap-2 text-xs font-bold text-brand"><span>{service.usesCloudApi ? "API oficial" : "Sem API"}</span><span>·</span><span>{service.usesAi ? "Com IA" : "Sem IA"}</span></div></article>; })}</div></section>;
}

function Metric({ icon: Icon, value, label }: { icon: typeof MessageCircleMore; value: number; label: string }) { return <div className="rounded-2xl bg-[#f3f5f1] p-4"><Icon className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{value}</p><p className="text-xs text-muted">{label}</p></div>; }
