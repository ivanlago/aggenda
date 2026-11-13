import { ActionForm } from "@/components/action-form";
import { updateBookingSettings } from "@/actions/schedule";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
export async function ReminderSettings() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "organization.settings.manage");
  const saveButton = (label: string) => canManage && <button className="primary-button sm:col-span-3 sm:w-fit">{label}</button>;
  return <section className="panel max-w-4xl">
    <h2 className="text-xl font-extrabold">Lembretes e relacionamento</h2><p className="mt-2 text-sm text-muted">Defina os avisos ao cliente e o prazo para ações de reativação.</p>
    <ActionForm action={updateBookingSettings} successMessage="Configurações de lembretes salvas." className="mt-6 grid gap-4 sm:grid-cols-3">
      <input type="hidden" name="settingsSection" value="reminders" />
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Lembretes antes do horário (horas)<input className="field" name="reminderOffsetsHours" defaultValue={organization.reminderOffsetsHours.join(", ")} disabled={!canManage} placeholder="48, 24, 2" /><span className="text-xs font-normal text-muted">Separe por vírgulas. Cada horário é enviado uma única vez.</span></label>
      <label className="grid gap-2 text-sm font-bold">Reativar após (dias)<input className="field" name="patientRecoveryDays" type="number" min="30" max="730" defaultValue={organization.patientRecoveryDays} disabled={!canManage} /></label>
      <label className="flex items-center gap-3 text-sm font-bold sm:col-span-3"><input name="reminderConfirmationEnabled" type="checkbox" defaultChecked={organization.reminderConfirmationEnabled} disabled={!canManage} />Solicitar confirmação do cliente</label>
      {saveButton("Salvar lembretes")}
    </ActionForm>
  </section>;

}
