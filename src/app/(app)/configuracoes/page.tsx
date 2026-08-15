import { updateOrganizationTerminology } from "@/actions/app";
import { updateBookingSettings } from "@/actions/schedule";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(
    organization.role,
    "organization.settings.manage"
  );

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={organization.name}
        title="Configurações"
        description="Adapte a linguagem ao seu negócio sem alterar a estrutura dos dados."
      />
      <section className="panel max-w-3xl">
        <h2 className="text-xl font-extrabold">Terminologia da organização</h2>
        <p className="mt-2 text-sm text-muted">
          Exemplos: cliente ou paciente; serviço ou procedimento; agendamento,
          consulta ou reunião.
        </p>
        <ActionForm
          action={updateOrganizationTerminology}
          successMessage="Terminologia salva com sucesso."
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <label className="grid gap-2 text-sm font-bold">
            Cliente, no singular
            <input
              className="field"
              name="clientLabel"
              defaultValue={organization.clientLabel}
              disabled={!canManage}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Cliente, no plural
            <input
              className="field"
              name="clientLabelPlural"
              defaultValue={organization.clientLabelPlural}
              disabled={!canManage}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Profissional, no singular
            <input
              className="field"
              name="professionalLabel"
              defaultValue={organization.professionalLabel}
              disabled={!canManage}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Profissional, no plural
            <input
              className="field"
              name="professionalLabelPlural"
              defaultValue={organization.professionalLabelPlural}
              disabled={!canManage}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Serviço, no singular
            <input
              className="field"
              name="serviceLabel"
              defaultValue={organization.serviceLabel}
              disabled={!canManage}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Serviço, no plural
            <input
              className="field"
              name="serviceLabelPlural"
              defaultValue={organization.serviceLabelPlural}
              disabled={!canManage}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Agendamento, no singular
            <input
              className="field"
              name="appointmentLabel"
              defaultValue={organization.appointmentLabel}
              disabled={!canManage}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Agendamento, no plural
            <input
              className="field"
              name="appointmentLabelPlural"
              defaultValue={organization.appointmentLabelPlural}
              disabled={!canManage}
              required
            />
          </label>
          {canManage && (
            <button className="primary-button sm:col-span-2 sm:w-fit">
              Salvar terminologia
            </button>
          )}
        </ActionForm>
      </section>
      <section className="panel mt-5 max-w-3xl">
        <h2 className="text-xl font-extrabold">Agendamento público</h2>
        <p className="mt-2 text-sm text-muted">
          Link público incluído: /agendar/{organization.slug}
        </p>
        <ActionForm
          action={updateBookingSettings}
          successMessage="Configurações do agendamento público salvas."
          className="mt-6 grid gap-4 sm:grid-cols-3"
        >
          <label className="flex items-center gap-3 text-sm font-bold sm:col-span-3">
            <input
              name="bookingEnabled"
              type="checkbox"
              defaultChecked={organization.bookingEnabled}
              disabled={!canManage}
            />
            Permitir agendamentos pela página pública
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Antecedência mínima (horas)
            <input
              className="field"
              name="bookingNoticeHours"
              type="number"
              min="0"
              defaultValue={organization.bookingNoticeHours}
              disabled={!canManage}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-3">Apresentação pública<textarea className="field min-h-20" name="publicDescription" defaultValue={organization.publicDescription ?? ""} disabled={!canManage} placeholder="Conte a especialidade e os diferenciais do negócio" /></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-3">Endereço público<input className="field" name="publicAddress" defaultValue={organization.publicAddress ?? ""} disabled={!canManage} /></label>
          <label className="grid gap-2 text-sm font-bold">Logo (URL)<input className="field" name="publicLogoUrl" type="url" defaultValue={organization.publicLogoUrl ?? ""} disabled={!canManage} /></label>
          <label className="grid gap-2 text-sm font-bold">Capa (URL)<input className="field" name="publicCoverUrl" type="url" defaultValue={organization.publicCoverUrl ?? ""} disabled={!canManage} /></label>
          <label className="grid gap-2 text-sm font-bold">Cor da marca<input className="field h-12" name="brandColor" type="color" defaultValue={organization.brandColor} disabled={!canManage} /></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">Domínio próprio (opcional)<input className="field" name="customDomain" defaultValue={organization.customDomain ?? ""} disabled={!canManage} placeholder="agenda.suamarca.com.br" /><span className="text-xs font-normal leading-5 text-muted">O link padrão do Aggenda continua disponível sem custo adicional. Se optar pelo domínio próprio, o registro, o DNS e a renovação permanecem sob responsabilidade da empresa. O Aggenda não compra nem renova domínios automaticamente.</span></label>
          <label className="grid gap-2 text-sm font-bold">Reativar após (dias)<input className="field" name="patientRecoveryDays" type="number" min="30" max="730" defaultValue={organization.patientRecoveryDays} disabled={!canManage} /></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">Lembretes antes do horário (horas)<input className="field" name="reminderOffsetsHours" defaultValue={organization.reminderOffsetsHours.join(", ")} disabled={!canManage} placeholder="48, 24, 2" /><span className="text-xs font-normal text-muted">Separe por vírgulas. Cada horário é enviado uma única vez.</span></label>
          <label className="flex items-center gap-3 text-sm font-bold"><input name="reminderConfirmationEnabled" type="checkbox" defaultChecked={organization.reminderConfirmationEnabled} disabled={!canManage} />Solicitar confirmação</label>
          <label className="grid gap-2 text-sm font-bold">
            Janela futura (dias)
            <input
              className="field"
              name="bookingHorizonDays"
              type="number"
              min="1"
              max="365"
              defaultValue={organization.bookingHorizonDays}
              disabled={!canManage}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Intervalo dos horários
            <select
              className="field"
              name="slotIntervalMinutes"
              defaultValue={organization.slotIntervalMinutes}
              disabled={!canManage}
            >
              {[5, 10, 15, 20, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>{minutes} minutos</option>
              ))}
            </select>
          </label>
          {canManage && (
            <button className="primary-button sm:col-span-3 sm:w-fit">
              Salvar agendamento público
            </button>
          )}
        </ActionForm>
      </section>
    </div>
  );
}
