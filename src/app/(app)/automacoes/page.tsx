import { and, eq } from "drizzle-orm";
import { Bot, CheckCircle2, MessageCircleMore, Sparkles, Workflow } from "lucide-react";

import { db } from "@/db";
import { organizationUsageCounters, whatsappChannels } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import {
  getOrganizationServicePlan,
  whatsappServiceCodes,
  whatsappServices,
} from "@/lib/service-plans";
import { requireOrganization } from "@/lib/session";

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
  const current = whatsappServices[plan.whatsappServiceCode];
  const usageByMetric = new Map(usage.map((item) => [item.metric, item.quantity]));
  const received = usageByMetric.get("whatsapp.inbound") ?? 0;
  const aiCalls = usageByMetric.get("ai.calls") ?? 0;

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
            <span className="status-pill">{plan.isLegacyFallback ? "Acesso legado" : "Configurado"}</span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f3f5f1] p-4"><MessageCircleMore className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{received}</p><p className="text-xs text-muted">recebidas no mês</p></div>
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
            <p className="mt-3 text-sm leading-6 text-muted">Nenhum número oficial conectado. O WhatsApp Assistido continua disponível sem API.</p>
          ) : (
            <div className="mt-4 grid gap-3">{channels.map((channel) => (
              <div className="rounded-xl border p-3" key={channel.id}>
                <p className="font-bold">{channel.displayPhoneNumber ?? "Número configurado"}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="size-3 text-brand" />{channel.isActive ? "Ativo" : "Pausado"}</p>
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
