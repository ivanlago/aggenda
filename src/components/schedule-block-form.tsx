import { createAvailabilityException } from "@/actions/schedule";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";
export function ScheduleBlockForm({ professionals }: { professionals: Array<{ id: string; name: string }> }) {
 return <ModalShell title="Bloquear horário" variant="new"><ActionForm action={createAvailabilityException} successMessage="Horário bloqueado." className="grid gap-4 sm:grid-cols-2">
  <input type="hidden" name="type" value="blocked" />
  <label className="grid gap-2 text-sm font-bold sm:col-span-2">Profissional<select className="field" name="professionalId" defaultValue={professionals.length === 1 ? professionals[0].id : ""} required><option value="" disabled>Selecione o profissional</option>{professionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  <label className="grid gap-2 text-sm font-bold">Início do bloqueio<input className="field" type="datetime-local" name="startsAt" required /></label>
  <label className="grid gap-2 text-sm font-bold">Fim do bloqueio<input className="field" type="datetime-local" name="endsAt" required /></label>
  <label className="grid gap-2 text-sm font-bold sm:col-span-2">Motivo<textarea className="field min-h-20" name="reason" maxLength={500} placeholder="Ex.: férias, reunião, almoço ou ausência" required /></label>
  <p className="text-sm text-muted sm:col-span-2">Informe o horário local da clínica. O bloqueio impede novos agendamentos nesse período. Os agendamentos existentes serão sinalizados para revisão.</p>
  <button className="primary-button sm:col-span-2 sm:w-fit" disabled={!professionals.length}>Salvar bloqueio</button>
 </ActionForm></ModalShell>;
}
