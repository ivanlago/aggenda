import { updateOrganizationTerminology } from "@/actions/app";
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
    </div>
  );
}
