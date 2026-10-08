import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { saveRoom } from "@/actions/rooms";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";

export async function RoomSettings({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
 const items = await db.select().from(rooms).where(eq(rooms.organizationId, organizationId)).orderBy(rooms.name);
 return <section className="panel max-w-4xl">
  <h2 className="text-xl font-extrabold">Salas de atendimento</h2>
  <p className="mt-2 text-sm text-muted">A sala é reservada para o período do agendamento. No agendamento online, uma sala disponível é selecionada automaticamente.</p>
  {canManage && <div className="mt-5"><ModalShell title="Nova sala" variant="new"><ActionForm action={saveRoom} successMessage="Sala cadastrada." className="grid gap-4"><RoomFields /><button className="primary-button">Cadastrar sala</button></ActionForm></ModalShell></div>}
  <div className="mt-5 divide-y">{items.map(room => <article key={room.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><h3 className="font-extrabold">{room.name} <span className="ml-2 text-xs font-normal text-muted">{room.isActive ? "Ativa" : "Inativa"}</span></h3>{room.description && <p className="mt-1 text-sm text-muted">{room.description}</p>}</div>{canManage && <ModalShell title={`Editar ${room.name}`} variant="edit"><ActionForm action={saveRoom} successMessage="Sala atualizada." className="grid gap-4"><input type="hidden" name="id" value={room.id} /><RoomFields room={room} /><p className="text-xs text-muted">Para desativar uma sala, transfira antes seus agendamentos futuros. O histórico permanece vinculado à sala.</p><button className="primary-button">Salvar sala</button></ActionForm></ModalShell>}</article>)}{!items.length && <p className="empty-state">Nenhuma sala cadastrada. Cadastre as salas para ativar o controle de reservas.</p>}</div>
 </section>;
}
function RoomFields({ room }: { room?: { name: string; description: string | null; isActive: boolean } }) {
 return <><label className="grid gap-2 text-sm font-bold">Nome da sala<input className="field" name="name" defaultValue={room?.name ?? ""} maxLength={80} placeholder="Ex.: Sala 1" required /></label><label className="grid gap-2 text-sm font-bold">Descrição<textarea className="field" name="description" defaultValue={room?.description ?? ""} maxLength={500} placeholder="Localização ou observações" /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isActive" defaultChecked={room?.isActive ?? true} />Sala ativa</label></>;
}
