import { transferAttendanceProfessional } from "@/actions/attendance-transfer";
import { ActionForm } from "@/components/action-form";

export function AttendanceTransferForm({ appointmentId, professionalId, choices }: { appointmentId: string; professionalId: string | null; choices: { id: string; name: string }[] }) {
  return <ActionForm action={transferAttendanceProfessional} successMessage="Atendimento transferido." className="mt-3 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <label className="grid gap-1 text-xs font-semibold text-slate-500">Transferir para<select className="field text-sm text-slate-800" name="professionalId" required defaultValue=""><option value="" disabled>Selecione o profissional</option>{choices.filter(person => person.id !== professionalId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <button className="secondary-button">Transferir atendimento</button>
    <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Mantém data, horário e sala. A habilitação para o serviço e a disponibilidade serão verificadas ao salvar.</p>
  </ActionForm>;
}
