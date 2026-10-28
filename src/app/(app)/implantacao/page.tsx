import { and, count, eq, isNull, or } from "drizzle-orm";
import { Building2, CalendarClock, CheckCircle2, Circle, MessageCircleMore, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { professionals, services, weeklyAvailability, whatsappChannels } from "@/db/schema";
import { landingOffer } from "@/lib/landing-content";
import { hasOrganizationPermission } from "@/lib/permissions";
import { getOrganizationServicePlan } from "@/lib/service-plans";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Implantação guiada" };

export default async function ImplantationPage() {
  const { organization } = await requireOrganization();
  if (organization.role === "professional") redirect("/dashboard");
  const [plan, [professionalTotal], [serviceTotal], [availabilityTotal], channels] = await Promise.all([
    getOrganizationServicePlan(organization.id),
    db.select({ value: count() }).from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true), eq(professionals.isBookable, true))),
    db.select({ value: count() }).from(services).where(eq(services.organizationId, organization.id)),
    db.select({ value: count() }).from(weeklyAvailability).leftJoin(professionals, and(eq(weeklyAvailability.professionalId, professionals.id), eq(professionals.organizationId, organization.id), eq(professionals.isActive, true), eq(professionals.isBookable, true))).where(and(eq(weeklyAvailability.organizationId, organization.id), or(isNull(weeklyAvailability.professionalId), eq(professionals.isActive, true)))),
    db.select({ isActive: whatsappChannels.isActive, connectionStatus: whatsappChannels.connectionStatus }).from(whatsappChannels).where(eq(whatsappChannels.organizationId, organization.id)),
  ]);
  const steps = [
    { title: "Confira os dados do negócio", description: "Revise nome, segmento e telefone de contato.", done: Boolean(organization.name && organization.businessType && organization.phone), href: "/configuracoes?aba=identity", action: "Revisar dados", icon: Building2 },
    { title: `Cadastre ${organization.serviceLabelPlural.toLowerCase()}`, description: "Informe os serviços oferecidos, a duração e os preços.", done: serviceTotal.value > 0, href: "/servicos", action: "Revisar serviços", icon: Wrench },
    { title: "Organize a equipe e os horários", description: "Cadastre os profissionais e defina os dias e horários de atendimento.", done: professionalTotal.value > 0 && availabilityTotal.value > 0, href: professionalTotal.value > 0 ? "/disponibilidade" : "/profissionais", action: professionalTotal.value > 0 ? "Definir horários" : "Cadastrar profissional", icon: CalendarClock },
  ];
  const complete = steps.filter(step => step.done).length;
  const next = steps.find(step => !step.done);
  const percentage = Math.round(complete / steps.length * 100);
  const hasAgent = plan.whatsappServiceCode === "chat_ai" || plan.whatsappServiceCode === "core_ai";
  const channelConnected = channels.some(channel => channel.isActive && channel.connectionStatus === "active");
  const canManageBilling = hasOrganizationPermission(organization.role, "billing.manage");

  return <div className="page-wrap">
    <PageHeader eyebrow={organization.name} title="Implantação guiada" description="Prepare o Aggenda para a sua rotina. A implantação e a orientação da equipe não têm cobrança adicional." />

    <section className="panel" aria-labelledby="setup-progress-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="setup-progress-title" className="text-xl font-extrabold">{complete} de {steps.length} passos iniciais preparados</h2>
        <span className="status-pill">{percentage}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-brand/10" role="progressbar" aria-label="Preparação inicial" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted">{next ? `Próximo passo: ${next.title.toLowerCase()}.` : "Os cadastros básicos estão preparados. Faça um agendamento de teste e confira o fluxo com sua equipe."}</p>
      <p className="mt-2 text-xs text-muted">O progresso considera os dados cadastrados. Revise os serviços e os horários antes de começar a atender.</p>
    </section>

    <section className="mt-5 grid gap-3" aria-label="Passos iniciais">
      {steps.map((step, index) => <article className="panel flex items-start gap-4" key={step.href}>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/5 text-brand"><step.icon className="size-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold">{index + 1}. {step.title}</h2>
            <span className="flex items-center gap-1 text-xs font-bold text-muted">{step.done ? <CheckCircle2 className="size-4 text-brand" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}{step.done ? "Cadastrado" : "A preparar"}</span>
          </div>
          <p className="mt-2 text-sm text-muted">{step.description}</p>
          <Link className="mt-3 inline-flex text-sm font-bold text-brand" href={step.href}>{step.action} →</Link>
        </div>
      </article>)}
    </section>

    <section className="panel mt-5" aria-labelledby="booking-setup-title">
      <h2 id="booking-setup-title" className="text-xl font-extrabold">Receba agendamentos online</h2>
      <p className="mt-2 text-sm text-muted">Se quiser receber reservas pela internet, habilite a página pública e teste a escolha de serviço, profissional e horário pelo celular antes de divulgar o link.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link className="secondary-button" href="/configuracoes?aba=booking">{organization.bookingEnabled ? "Revisar agendamento online" : "Habilitar agendamento online"}</Link>
        {organization.bookingEnabled && <Link className="secondary-button" href={`/agendar/${encodeURIComponent(organization.slug)}`} target="_blank" rel="noopener noreferrer">Ver página pública</Link>}
        <Link className="secondary-button" href="/agenda">Abrir agenda</Link>
      </div>
    </section>

    {hasAgent && <section className="panel mt-5" aria-labelledby="whatsapp-setup-title">
      <h2 id="whatsapp-setup-title" className="flex items-center gap-2 text-xl font-extrabold"><MessageCircleMore className="size-5 text-brand" aria-hidden="true" />Prepare o WhatsApp do seu plano</h2>
      <p className="mt-2 text-sm text-muted">{plan.whatsappServiceCode === "core_ai" ? "O Completo inclui o Aggenda Secretária para atendimento e operações de agenda pelo WhatsApp." : "O Profissional inclui o Aggenda Atendimento para informar sobre os serviços e encaminhar ao agendamento."} Revise as descrições dos serviços, conecte o canal e faça um teste antes de divulgar.</p>
      <p className="mt-3 text-sm font-bold">{channelConnected ? "Canal conectado. Confira as configurações e teste o atendimento." : "Canal ainda não conectado. A equipe pode orientar essa configuração."}</p>
      <p className="mt-2 text-xs text-muted">A conexão do canal não confirma a ativação do agente. O uso segue a configuração, as franquias do plano e as tarifas externas aplicáveis.</p>
      <Link className="mt-4 inline-flex text-sm font-bold text-brand" href="/configuracoes?aba=whatsapp">Configurar WhatsApp →</Link>
    </section>}

    <section className="panel mt-5" aria-labelledby="setup-help-title">
      <h2 id="setup-help-title" className="text-xl font-extrabold">Conte com a equipe para começar</h2>
      <p className="mt-2 text-sm text-muted">A orientação de implantação é gratuita nos planos Essential, Profissional e Completo. Você pode seguir este roteiro ou pedir ajuda à equipe.</p>
      <p className="mt-3 text-sm text-muted">A primeira importação de clientes e serviços também é gratuita. Prepare os arquivos em Excel ou CSV; a equipe confere os campos e a compatibilidade. Prontuários, fotos, documentos e histórico financeiro precisam de avaliação separada.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a className="secondary-button" href={`mailto:${landingOffer.contactEmail}?subject=${encodeURIComponent("Ajuda com a implantação do Aggenda")}`}>Pedir orientação à equipe</a>
        {canManageBilling && <Link className="secondary-button" href="/assinatura">Gerenciar assinatura</Link>}
      </div>
    </section>
  </div>;
}
