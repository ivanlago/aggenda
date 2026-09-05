import { and, eq } from "drizzle-orm";
import { Bot, CheckCircle2, MessageCircleMore, Sparkles, Workflow } from "lucide-react";

import { db } from "@/db";
import { organizationUsageCounters, whatsappChannels } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { WhatsAppConnectButton } from "@/components/whatsapp-connect-button";
import {
  getOrganizationServicePlan,
  whatsappServiceCodes,
  whatsappServices,
} from "@/lib/service-plans";
import { requireOrganization } from "@/lib/session";
import { formatPhone } from "@/lib/phone";

export const metadata = { title: "WhatsApp e automações" };

function firstDayOfMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function AutomationsPage() {
  const { organization } = await requireOrganization();
  const [plan, channels, usage] = await Promise.all([
    getOrganizationServicePlan(organization.id),
    db.select().from(whatsappChannels).where(eq(whatsappChannels.organizationId, organization.id)),
    db.select().from(organizationUsageCounters).where(and(
      eq(organizationUsageCounters.organizationId, organization.id),
      eq(organizationUsageCounters.periodStart, firstDayOfMonth()),
    )),
  ]);
  channels.forEach((channel) => { channel.displayPhoneNumber = formatPhone(channel.displayPhoneNumber) || null; });
  const current = whatsappServices[plan.whatsappServiceCode];
  const usageByMetric = new Map(usage.map((item) => [item.metric, item.quantity]));
  const received = usageByMetric.get("whatsapp.inbound") ?? 0;
  const sent = usageByMetric.get("whatsapp.outbound") ?? 0;
  const aiCalls = usageByMetric.get("ai.calls") ?? 0;
  const whatsappUsage = received + sent;
  const whatsappLimitReached = plan.whatsappMonthlyLimit > 0 && whatsappUsage >= plan.whatsappMonthlyLimit;
  const aiLimitReached = plan.aiMonthlyLimit > 0 && aiCalls >= plan.aiMonthlyLimit;
  const activeChannel = channels.some((channel) => channel.isActive && channel.connectionStatus === "active");
  const workflowUrls = {
    CHAT: process.env.N8N_CHAT_WEBHOOK_URL,
    CHAT_AI: process.env.N8N_CHAT_AI_WEBHOOK_URL,
    CORE: process.env.N8N_CORE_WEBHOOK_URL,
    CORE_AI: undefined,
  };
  const templatesReady = [
    process.env.META_TEMPLATE_APPOINTMENT_CONFIRMATION,
    process.env.META_TEMPLATE_APPOINTMENT_RESCHEDULE,
    process.env.META_TEMPLATE_APPOINTMENT_CANCELLATION,
    process.env.META_TEMPLATE_APPOINTMENT_REMINDER,
  ].every(Boolean);
  const channelReady = !current.usesCloudApi || activeChannel;
  const internalAgentReady = Boolean(process.env.AGGENDA_INTERNAL_API_URL && process.env.AGGENDA_INTERNAL_API_KEY);
  const workflowReady = !current.workflowProduct
    || (current.workflowProduct === "CORE_AI" ? internalAgentReady : Boolean(workflowUrls[current.workflowProduct]));
  const serviceReady = channelReady && (!current.usesCloudApi || templatesReady) && workflowReady;

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={organization.name}
        title="WhatsApp e automações"
        description="Acompanhe o serviço contratado, os canais conectados e o consumo mensal."
      />

      <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <article className="panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-widest text-brand">Serviço atual</p>
              <h2 className="mt-2 text-2xl font-extrabold">{current.name}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{current.description}</p>
            </div>
            <span className="status-pill">{serviceReady ? "Pronto" : plan.isLegacyFallback ? "Acesso legado" : "Configuração pendente"}</span>
          </div>
          <div className={`mt-5 rounded-xl p-3 text-sm font-bold ${serviceReady ? "bg-[#edf7f1] text-brand" : "bg-amber-50 text-amber-800"}`}>
            {serviceReady ? "Serviço pronto para homologação." : "Configuração incompleta: "}
            {!channelReady && "conecte um canal Meta ativo; "}
            {current.usesCloudApi && !templatesReady && "configure os quatro templates transacionais; "}
            {!workflowReady && (current.workflowProduct === "CORE_AI" ? "configure o agente interno do Aggenda;" : `configure o webhook ${current.workflowProduct};`)}
          </div>
          {(whatsappLimitReached || aiLimitReached) && (
            <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800" role="alert">
              {whatsappLimitReached ? "A franquia mensal do WhatsApp foi atingida. " : ""}
              {aiLimitReached ? "A franquia mensal de IA foi atingida. " : ""}
              O atendimento automático excedente será direcionado ao fallback disponível.
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-[#f3f5f1] p-4"><MessageCircleMore className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{received}</p><p className="text-xs text-muted">recebidas no mês</p></div>
            <div className="rounded-2xl bg-[#f3f5f1] p-4"><MessageCircleMore className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{sent}</p><p className="text-xs text-muted">enviadas no mês</p></div>
            <div className="rounded-2xl bg-[#f3f5f1] p-4"><Sparkles className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{aiCalls}</p><p className="text-xs text-muted">chamadas de IA</p></div>
            <div className="rounded-2xl bg-[#f3f5f1] p-4"><Workflow className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{channels.filter((channel) => channel.isActive).length}</p><p className="text-xs text-muted">canais ativos</p></div>
          </div>
          <div className="mt-5 grid gap-2 text-sm">
            <p><strong>Franquia WhatsApp:</strong> {plan.whatsappMonthlyLimit === 0 ? "sem limite configurado" : `${plan.whatsappMonthlyLimit}/mês`}</p>
            <p><strong>Franquia de IA:</strong> {plan.aiMonthlyLimit === 0 ? "sem limite configurado" : `${plan.aiMonthlyLimit}/mês`}</p>
          </div>
        </article>

        <aside className="panel">
          <Bot className="size-6 text-brand" />
          <h2 className="mt-5 text-xl font-extrabold">Canal conectado</h2>
          {channels.length === 0 ? (
            <>
              <p className="mt-3 text-sm leading-6 text-muted">Nenhum número oficial conectado. Entre na Meta, informe ou escolha o número empresarial e confirme o código recebido.</p>
              {current.usesCloudApi ? <WhatsAppConnectButton
                  appId={process.env.NEXT_PUBLIC_META_APP_ID}
                  configurationId={process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIGURATION_ID}
                /> : <p className="mt-3 rounded-xl bg-[#edf7f1] p-3 text-xs font-semibold text-brand">O WhatsApp Assistido não precisa conectar um número à API.</p>}
            </>
          ) : (
            <div className="mt-4 grid gap-3">{channels.map((channel) => (
              <div className="rounded-xl border p-3" key={channel.id}>
                <p className="font-bold">{channel.displayPhoneNumber ?? "Número configurado"}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="size-3 text-brand" />{channel.connectionStatus === "active" && channel.isActive ? "Ativo" : "Pendente"}</p>
              </div>
            ))}</div>
          )}
        </aside>
      </section>

      <section className="mt-5">
        <h2 className="text-xl font-extrabold">Serviços disponíveis</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {whatsappServiceCodes.map((code) => {
            const service = whatsappServices[code];
            const active = code === plan.whatsappServiceCode;
            return <article className={`panel ${active ? "ring-2 ring-brand/20" : ""}`} key={code}>
              <div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">{service.name}</h3>{active && <span className="status-pill">Atual</span>}</div>
              <p className="mt-3 text-sm leading-6 text-muted">{service.description}</p>
              <div className="mt-5 flex gap-2 text-xs font-bold text-brand">
                <span>{service.usesCloudApi ? "API oficial" : "Sem API"}</span><span>·</span><span>{service.usesAi ? "Com IA" : "Sem IA"}</span>
              </div>
            </article>;
          })}
        </div>
      </section>
    </div>
  );
}
