import { assignAppointmentRoom } from "@/actions/rooms";
import { ActionForm } from "@/components/action-form";
export function AppointmentRoomForm({ appointmentId, roomId, rooms }: { appointmentId: string; roomId: string | null; rooms: Array<{ id: string; name: string; isActive: boolean }> }) {
 if (!rooms.length) return null;
 return <ActionForm action={assignAppointmentRoom} successMessage="Sala do atendimento atualizada." className="grid gap-2"><input type="hidden" name="id" value={appointmentId} /><label className="grid gap-2 text-sm font-bold">Sala do atendimento<select className="field" name="roomId" defaultValue={roomId ?? ""}><option value="">Selecionar automaticamente</option>{rooms.filter(room => room.isActive || room.id === roomId).map(room => <option key={room.id} value={room.id}>{room.name}{!room.isActive ? " (inativa)" : ""}</option>)}</select></label><button className="secondary-button w-fit">Salvar sala</button><p className="text-xs text-muted">A disponibilidade será verificada ao salvar.</p></ActionForm>;
}
