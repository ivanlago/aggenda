import { and, count, eq, isNotNull } from "drizzle-orm";
import {
  Bot,
  Building2,
  CalendarClock,
  CheckCircle2,
  Circle,
  MessageCircleMore,
  Rocket,
  Sparkles,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { WhatsAppConnectButton } from "@/components/whatsapp-connect-button";
import { db } from "@/db";
import { professionals, services, weeklyAvailability, whatsappChannels } from "@/db/schema";
import { getOrganizationServicePlan, whatsappServices } from "@/lib/service-plans";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Implantação guiada" };

type Step = {
  title: string;
  description: string;
  done: boolean;
  href?: string;
  action?: string;
  automatic?: boolean;
};

export default async function ImplantationPage() {
  const { organization } = await requireOrganization();
  const [plan, [professionalTotal], [serviceTotal], [describedServiceTotal], [availabilityTotal], channels] = await Promise.all([
    getOrganizationServicePlan(organization.id),
    db.select({ value: count() }).from(professionals).where(eq(professionals.organizationId, organization.id)),
    db.select({ value: count() }).from(services).where(eq(services.organizationId, organization.id)),
    db.select({ value: count() }).from(services).where(and(eq(services.organizationId, organization.id), isNotNull(services.description))),
    db.select({ value: count() }).from(weeklyAvailability).where(eq(weeklyAvailability.organizationId, organization.id)),
    db.select().from(whatsappChannels).where(eq(whatsappChannels.organizationId, organization.id)),
  ]);
  const product = whatsappServices[plan.whatsappServiceCode];
  const activeChannel = channels.find((channel) => channel.isActive && channel.connectionStatus === "active");
  const profileReady = Boolean(organization.businessType);
  const catalogReady = serviceTotal.value > 0;
  const knowledgeReady = !product.usesAi || (catalogReady && describedServiceTotal.value === serviceTotal.value);
  const scheduleRequired = plan.whatsappServiceCode === "core_ai";
  const scheduleReady = !scheduleRequired || (professionalTotal.value > 0 && availabilityTotal.value > 0);
  const channelReady = !product.usesCloudApi || Boolean(activeChannel);
  const templatesReady = !product.usesCloudApi || [
    process.env.META_TEMPLATE_APPOINTMENT_CONFIRMATION,
    process.env.META_TEMPLATE_APPOINTMENT_RESCHEDULE,
    process.env.META_TEMPLATE_APPOINTMENT_CANCELLATION,
    process.env.META_TEMPLATE_APPOINTMENT_REMINDER,
  ].every(Boolean);
  const workflowUrls = {
    CHAT: process.env.N8N_CHAT_WEBHOOK_URL,
    CHAT_AI: process.env.N8N_CHAT_AI_WEBHOOK_URL,
    CORE: process.env.N8N_CORE_WEBHOOK_URL,
    CORE_AI: process.env.N8N_CORE_AI_WEBHOOK_URL,
  };
  const automationReady = !product.workflowProduct || Boolean(workflowUrls[product.workflowProduct]);

  const steps: Step[] = [
    {
      title: "Confirme os dados do negócio",
      description: "Informe telefone, segmento, endereço e identidade que seus clientes reconhecerão.",
      done: profileReady,
      href: "/configuracoes",
      action: "Revisar dados",
    },
    {
      title: `Cadastre ${organization.serviceLabelPlural.toLowerCase()}`,
      description: product.usesAi
        ? "Nome, descrição e duração ensinam à IA exatamente o que sua empresa oferece. Evite abreviações."
        : "Esses dados serão usados nas mensagens e no atendimento.",
      done: catalogReady && knowledgeReady,
      href: "/servicos",
      action: product.usesAi ? "Preparar base da IA" : `Cadastrar ${organization.serviceLabelPlural.toLowerCase()}`,
    },
    ...(scheduleRequired ? [{
      title: "Prepare a agenda que a IA poderá consultar",
      description: `Cadastre ${organization.professionalLabelPlural.toLowerCase()} e os horários reais de atendimento. A IA só oferecerá horários disponíveis no Aggenda.`,
      done: scheduleReady,
      href: professionalTotal.value > 0 ? "/disponibilidade" : "/profissionais",
      action: professionalTotal.value > 0 ? "Definir horários" : `Cadastrar ${organization.professionalLabel.toLowerCase()}`,
    }] : []),
    {
      title: "Conecte o número oficial do WhatsApp",
      description: "Você entrará na Meta, escolherá ou adicionará o número e confirmará o código recebido. O Aggenda conclui a parte técnica.",
      done: channelReady,
    },
    {
      title: "Configuração técnica do atendimento",
      description: "Webhooks, modelos de mensagem, segurança, automação e roteamento são configurados pela equipe Aggenda.",
      done: templatesReady && automationReady,
      automatic: true,
    },
    {
      title: "Homologação assistida",
      description: "Depois das etapas anteriores, a equipe Aggenda testa uma conversa completa antes de liberar o número aos clientes.",
      done: profileReady && catalogReady && knowledgeReady && scheduleReady && channelReady && templatesReady && automationReady,
      automatic: true,
    },
  ];
  const complete = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);
  const percentage = Math.round((complete / steps.length) * 100);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={`${organization.name} · ${product.name}`}
        title="Vamos colocar seu atendimento no ar"
        description="Siga apenas o próximo passo indicado. O Aggenda cuida automaticamente das configurações técnicas."
      />

      <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <article className="panel overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Progresso da implantação</p>
              <h2 className="mt-2 text-2xl font-extrabold">{complete} de {steps.length} etapas concluídas</h2>
            </div>
            <span className="status-pill">{percentage}%</span>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e5e9e3]">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percentage}%` }} />
          </div>
          {nextStep ? (
            <div className="mt-6 rounded-2xl bg-[#edf7f1] p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Seu próximo passo</p>
              <p className="mt-2 text-lg font-extrabold">{nextStep.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{nextStep.description}</p>
              {nextStep.href && <Link className="primary-button mt-4 inline-flex" href={nextStep.href}>{nextStep.action}</Link>}
              {!nextStep.href && !nextStep.automatic && product.usesCloudApi && (
                <WhatsAppConnectButton
                  appId={process.env.NEXT_PUBLIC_META_APP_ID}
                  configurationId={process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIGURATION_ID}
                />
              )}
              {nextStep.automatic && <p className="mt-3 text-sm font-bold text-brand">Nenhuma ação sua é necessária nesta etapa.</p>}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl bg-[#edf7f1] p-5 text-brand">
              <p className="flex items-center gap-2 font-extrabold"><Rocket className="size-5" /> Implantação concluída</p>
              <p className="mt-2 text-sm">Seu serviço está preparado para operar.</p>
            </div>
          )}
        </article>

        <aside className="panel">
          <Sparkles className="size-6 text-brand" />
          <h2 className="mt-4 text-xl font-extrabold">O que a IA poderá fazer</h2>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-muted">
            <p>• Responder somente com informações aprovadas do seu negócio.</p>
            <p>• Entender pedidos escritos em linguagem natural.</p>
            {plan.whatsappServiceCode === "core_ai" && <p>• Consultar horários e criar, remarcar ou cancelar após confirmação do cliente.</p>}
            <p>• Encaminhar para uma pessoa quando não tiver segurança para responder.</p>
          </div>
          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
            A IA não recebe sua senha da Meta e não pode alterar configurações administrativas.
          </p>
        </aside>
      </section>

      <section className="mt-5 grid gap-3">
        {steps.map((step, index) => {
          const icons = [Building2, Wrench, CalendarClock, MessageCircleMore, Bot, Sparkles];
          const Icon = icons[index] ?? Bot;
          return (
            <article className={`panel flex gap-4 ${step.done ? "border-brand/20 bg-[#fbfffc]" : ""}`} key={step.title}>
              <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${step.done ? "bg-[#edf7f1] text-brand" : "bg-[#f3f5f1] text-muted"}`}>
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold">{index + 1}. {step.title}</h3>
                  <span className={`flex items-center gap-1 text-xs font-bold ${step.done ? "text-brand" : "text-muted"}`}>
                    {step.done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                    {step.done ? "Concluído" : step.automatic ? "Equipe Aggenda" : "Pendente"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
                {!step.done && step.href && <Link className="mt-3 inline-flex text-sm font-extrabold text-brand" href={step.href}>{step.action} →</Link>}
                {step.done && step.title.includes("WhatsApp") && activeChannel && <p className="mt-2 text-sm font-bold text-brand">Número conectado: {activeChannel.displayPhoneNumber}</p>}
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel mt-5">
        <h2 className="text-xl font-extrabold">O que o cliente precisa ter em mãos</h2>
        <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded-xl border p-3"><strong className="block text-foreground">Acesso ao Facebook</strong>Perfil com permissão para administrar a empresa.</p>
          <p className="rounded-xl border p-3"><strong className="block text-foreground">Número do WhatsApp</strong>Linha ativa que receba SMS ou ligação.</p>
          <p className="rounded-xl border p-3"><strong className="block text-foreground">Dados do negócio</strong>Nome, segmento, endereço e horários.</p>
          <p className="rounded-xl border p-3"><strong className="block text-foreground">Catálogo</strong>Serviços, descrições, duração e profissionais.</p>
        </div>
      </section>
    </div>
  );
}
