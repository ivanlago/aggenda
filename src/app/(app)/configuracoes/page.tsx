import { updateOrganizationTerminology } from "@/actions/app";
import { updateBookingSettings } from "@/actions/schedule";
import { PageHeader } from "@/components/page-header";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { organization } = await requireOrganization();
  const canManage = ["owner", "admin"].includes(organization.role);

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
        <form action={updateOrganizationTerminology} className="mt-6 grid gap-4 sm:grid-cols-2">
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
        </form>
      </section>
      <section className="panel mt-5 max-w-3xl">
        <h2 className="text-xl font-extrabold">Agendamento público</h2>
        <p className="mt-2 text-sm text-muted">
          Link público: /agendar/{organization.slug}
        </p>
        <form action={updateBookingSettings} className="mt-6 grid gap-4 sm:grid-cols-3">
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
        </form>
      </section>
    </div>
  );
}
