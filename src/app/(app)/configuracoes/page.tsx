import { updateOrganizationTerminology } from "@/actions/app";
import { updateBookingSettings } from "@/actions/schedule";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

import { SettingsTabs } from "./settings-tabs";
import { AutomationAndAiSettingsContent, WhatsAppSettingsContent } from "./automation-settings-content";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "organization.settings.manage");
  const saveButton = (label: string) => canManage && <button className="primary-button sm:col-span-3 sm:w-fit">{label}</button>;

  const terminology = <section className="panel max-w-4xl">
    <h2 className="text-xl font-extrabold">Terminologia da organização</h2><p className="mt-2 text-sm text-muted">Adapte os nomes utilizados pelo Aggenda à atividade da empresa.</p>
    <ActionForm action={updateOrganizationTerminology} successMessage="Terminologia salva com sucesso." className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">Cliente, no singular<input className="field" name="clientLabel" defaultValue={organization.clientLabel} disabled={!canManage} required /></label>
      <label className="grid gap-2 text-sm font-bold">Cliente, no plural<input className="field" name="clientLabelPlural" defaultValue={organization.clientLabelPlural} disabled={!canManage} required /></label>
      <label className="grid gap-2 text-sm font-bold">Profissional, no singular<input className="field" name="professionalLabel" defaultValue={organization.professionalLabel} disabled={!canManage} required /></label>
      <label className="grid gap-2 text-sm font-bold">Profissional, no plural<input className="field" name="professionalLabelPlural" defaultValue={organization.professionalLabelPlural} disabled={!canManage} required /></label>
      <label className="grid gap-2 text-sm font-bold">Serviço, no singular<input className="field" name="serviceLabel" defaultValue={organization.serviceLabel} disabled={!canManage} required /></label>
      <label className="grid gap-2 text-sm font-bold">Serviço, no plural<input className="field" name="serviceLabelPlural" defaultValue={organization.serviceLabelPlural} disabled={!canManage} required /></label>
      <label className="grid gap-2 text-sm font-bold">Agendamento, no singular<input className="field" name="appointmentLabel" defaultValue={organization.appointmentLabel} disabled={!canManage} required /></label>
      <label className="grid gap-2 text-sm font-bold">Agendamento, no plural<input className="field" name="appointmentLabelPlural" defaultValue={organization.appointmentLabelPlural} disabled={!canManage} required /></label>
      {canManage && <button className="primary-button sm:col-span-2 sm:w-fit">Salvar terminologia</button>}
    </ActionForm>
  </section>;

  const booking = <section className="panel max-w-4xl">
    <h2 className="text-xl font-extrabold">Agendamento público</h2><p className="mt-2 text-sm text-muted">Link público: /agendar/{organization.slug}</p>
    <ActionForm action={updateBookingSettings} successMessage="Regras de agendamento salvas." className="mt-6 grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="settingsSection" value="booking" />
      <label className="flex items-center gap-3 text-sm font-bold sm:col-span-3"><input name="bookingEnabled" type="checkbox" defaultChecked={organization.bookingEnabled} disabled={!canManage} />Permitir agendamentos pela página pública</label>
      <label className="grid gap-2 text-sm font-bold">Antecedência mínima (horas)<input className="field" name="bookingNoticeHours" type="number" min="0" defaultValue={organization.bookingNoticeHours} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Janela futura (dias)<input className="field" name="bookingHorizonDays" type="number" min="1" max="365" defaultValue={organization.bookingHorizonDays} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Intervalo dos horários<select className="field" name="slotIntervalMinutes" defaultValue={organization.slotIntervalMinutes} disabled={!canManage}>{[5, 10, 15, 20, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select></label>
      {saveButton("Salvar regras do agendamento")}
    </ActionForm>
  </section>;

  const identity = <section className="panel max-w-4xl">
    <h2 className="text-xl font-extrabold">Identidade e dados institucionais</h2><p className="mt-2 text-sm text-muted">Informações usadas na página pública, nos documentos e PDFs.</p>
    <ActionForm action={updateBookingSettings} successMessage="Identidade institucional salva." className="mt-6 grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="settingsSection" value="identity" />
      <label className="grid gap-2 text-sm font-bold sm:col-span-3">Apresentação pública<textarea className="field min-h-20" name="publicDescription" defaultValue={organization.publicDescription ?? ""} disabled={!canManage} placeholder="Conte a especialidade e os diferenciais do negócio" /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Razão social<input className="field" name="legalName" defaultValue={organization.legalName ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">CNPJ ou CPF institucional<input className="field" name="taxId" defaultValue={organization.taxId ?? ""} disabled={!canManage} inputMode="numeric" /></label>
      <label className="grid gap-2 text-sm font-bold">Telefone<input className="field" name="phone" defaultValue={organization.phone ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">WhatsApp<input className="field" name="publicWhatsapp" defaultValue={organization.publicWhatsapp ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">E-mail institucional<input className="field" type="email" name="publicEmail" defaultValue={organization.publicEmail ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Site<input className="field" type="url" name="publicWebsite" defaultValue={organization.publicWebsite ?? ""} disabled={!canManage} placeholder="https://..." /></label>
      <label className="grid gap-2 text-sm font-bold">Cor da marca<input className="field h-12" name="brandColor" type="color" defaultValue={organization.brandColor} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-3">Endereço público<input className="field" name="publicAddress" defaultValue={organization.publicAddress ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Logo (URL)<input className="field" name="publicLogoUrl" type="url" defaultValue={organization.publicLogoUrl ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Capa (URL)<input className="field" name="publicCoverUrl" type="url" defaultValue={organization.publicCoverUrl ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Domínio próprio<input className="field" name="customDomain" defaultValue={organization.customDomain ?? ""} disabled={!canManage} placeholder="agenda.suamarca.com.br" /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-3">Rodapé dos documentos<textarea className="field min-h-20" name="documentFooter" defaultValue={organization.documentFooter ?? ""} disabled={!canManage} /></label>
      {saveButton("Salvar identidade institucional")}
    </ActionForm>
  </section>;

  const reminders = <section className="panel max-w-4xl">
    <h2 className="text-xl font-extrabold">Lembretes e relacionamento</h2><p className="mt-2 text-sm text-muted">Defina os avisos ao cliente e o prazo para ações de reativação.</p>
    <ActionForm action={updateBookingSettings} successMessage="Configurações de lembretes salvas." className="mt-6 grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="settingsSection" value="reminders" />
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Lembretes antes do horário (horas)<input className="field" name="reminderOffsetsHours" defaultValue={organization.reminderOffsetsHours.join(", ")} disabled={!canManage} placeholder="48, 24, 2" /><span className="text-xs font-normal text-muted">Separe por vírgulas. Cada horário é enviado uma única vez.</span></label>
      <label className="grid gap-2 text-sm font-bold">Reativar após (dias)<input className="field" name="patientRecoveryDays" type="number" min="30" max="730" defaultValue={organization.patientRecoveryDays} disabled={!canManage} /></label>
      <label className="flex items-center gap-3 text-sm font-bold sm:col-span-3"><input name="reminderConfirmationEnabled" type="checkbox" defaultChecked={organization.reminderConfirmationEnabled} disabled={!canManage} />Solicitar confirmação do cliente</label>
      {saveButton("Salvar lembretes")}
    </ActionForm>
  </section>;

  const policies = <section className="panel max-w-4xl">
    <h2 className="text-xl font-extrabold">Políticas exibidas ao cliente</h2><p className="mt-2 text-sm text-muted">Textos apresentados durante o relacionamento e o agendamento.</p>
    <ActionForm action={updateBookingSettings} successMessage="Políticas salvas." className="mt-6 grid gap-4">
      <input type="hidden" name="settingsSection" value="policies" />
      <label className="grid gap-2 text-sm font-bold">Cancelamento e reagendamento<textarea className="field min-h-24" name="cancellationPolicy" defaultValue={organization.cancellationPolicy ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Devolução ou aproveitamento do sinal<textarea className="field min-h-24" name="depositRefundPolicy" defaultValue={organization.depositRefundPolicy ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Atrasos e não comparecimento<textarea className="field min-h-24" name="latenessPolicy" defaultValue={organization.latenessPolicy ?? ""} disabled={!canManage} /></label>
      <label className="grid gap-2 text-sm font-bold">Privacidade e uso de dados<textarea className="field min-h-24" name="publicPrivacyPolicy" defaultValue={organization.publicPrivacyPolicy ?? ""} disabled={!canManage} /></label>
      {canManage && <button className="primary-button sm:w-fit">Salvar políticas</button>}
    </ActionForm>
  </section>;

  return <div className="page-wrap">
    <PageHeader eyebrow={organization.name} title="Configurações" description="Configure cada área do negócio em uma seção própria." />
    <SettingsTabs tabs={[
      { id: "terminology", label: "Terminologia", content: terminology },
      { id: "booking", label: "Agendamento", content: booking },
      { id: "identity", label: "Identidade", content: identity },
      { id: "reminders", label: "Lembretes", content: reminders },
      { id: "policies", label: "Políticas", content: policies },
      { id: "whatsapp", label: "WhatsApp", content: <WhatsAppSettingsContent /> },
      { id: "automation", label: "Automações e IA", content: <AutomationAndAiSettingsContent /> },
    ]} />
  </div>;
}
