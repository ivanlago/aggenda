import { eq } from "drizzle-orm";
import { db } from "@/db";
import { equipment, services, servicesToEquipment } from "@/db/schema";
import { saveEquipment } from "@/actions/equipment";
import { ActionForm } from "./action-form";
import { FormActions } from "./form-dialog-context";
import { ModalShell } from "./modal-shell";
import { PaginatedCollection } from "./paginated-collection";

export async function EquipmentSettings({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [items, catalog, links] = await Promise.all([
    db.select().from(equipment).where(eq(equipment.organizationId, organizationId)).orderBy(equipment.sortOrder, equipment.name),
    db.select({ id: services.id, name: services.name, active: services.isActive }).from(services).where(eq(services.organizationId, organizationId)).orderBy(services.name),
    db.select().from(servicesToEquipment).where(eq(servicesToEquipment.organizationId, organizationId)),
  ]);
  return <section className="panel">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Equipamentos</h2>{canManage && <ModalShell title="Novo equipamento" triggerLabel="Novo equipamento" variant="new"><ActionForm action={saveEquipment} successMessage="Equipamento cadastrado." className="grid gap-4"><EquipmentFields catalog={catalog} /><FormActions /></ActionForm></ModalShell>}</div>
    <p className="my-3 text-sm text-muted">Vincule os serviços que precisam de cada equipamento. O uso exclusivo bloqueia atendimentos simultâneos, mesmo com profissionais e salas diferentes. Equipamentos compartilhados não bloqueiam horários.</p>
    <div className="overflow-x-auto"><table className="app-list-table w-full text-left text-sm"><thead><tr><th>Equipamento</th><th>Ordem</th><th>Uso</th><th>Serviços vinculados</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
      <PaginatedCollection as="tbody" label="Equipamentos">{items.map(item => {
        const serviceIds = links.filter(link => link.equipmentId === item.id).map(link => link.serviceId);
        return <tr key={item.id}><td className="font-bold">{item.name}</td><td>{item.sortOrder}</td><td>{item.allowsConcurrent ? "Compartilhado" : "Exclusivo"}</td><td>{catalog.filter(service => serviceIds.includes(service.id)).map(service => service.name).join(", ") || "Nenhum"}</td><td><span className="status-pill">{item.isActive ? "Ativo" : "Inativo"}</span></td><td>{canManage && <ModalShell title={`Editar equipamento: ${item.name}`} variant="edit"><ActionForm action={saveEquipment} successMessage="Equipamento atualizado." className="grid gap-4"><input type="hidden" name="id" value={item.id} /><EquipmentFields item={item} catalog={catalog} serviceIds={serviceIds} /><FormActions editing /></ActionForm></ModalShell>}</td></tr>;
      })}</PaginatedCollection></table></div>
    {!items.length && <p className="empty-state">Nenhum equipamento cadastrado.</p>}
  </section>;
}

function EquipmentFields({ item, catalog, serviceIds = [] }: { item?: typeof equipment.$inferSelect; catalog: { id: string; name: string; active: boolean }[]; serviceIds?: string[] }) {
  return <>
    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_0.6fr_1.5fr_1fr]">
      <label className="grid min-w-0 gap-2 text-sm font-bold">Nome do equipamento *<input className="field" name="name" maxLength={100} defaultValue={item?.name ?? ""} required /></label>
      <label className="grid gap-2 text-sm font-bold">Ordem<input className="field" name="sortOrder" type="number" min={0} max={99999} defaultValue={item?.sortOrder ?? 0} /></label>
      <label className="grid gap-2 text-sm font-bold">Permite atendimentos simultâneos?<select className="field" name="allowsConcurrent" defaultValue={String(item?.allowsConcurrent ?? false)}><option value="false">Não — uso exclusivo</option><option value="true">Sim — compartilhado</option></select></label>
      <label className="grid gap-2 text-sm font-bold">Status<select className="field" name="isActive" defaultValue={String(item?.isActive ?? true)}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
    </div>
    <fieldset className="rounded-xl border p-3"><legend className="px-1 text-sm font-bold">Serviços que utilizam este equipamento</legend><div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{catalog.map(service => <label key={service.id} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="serviceIds" value={service.id} defaultChecked={serviceIds.includes(service.id)} />{service.name}{!service.active && " (inativo)"}</label>)}</div>{!catalog.length && <p className="text-sm text-muted">Cadastre os serviços em Produtos e Serviços para vinculá-los.</p>}</fieldset>
    <p className="text-xs text-muted">O equipamento é utilizado durante todo o atendimento. Todos os equipamentos vinculados ao serviço precisam estar disponíveis. Alterar os vínculos também afeta os agendamentos futuros. Campos com * são obrigatórios.</p>
  </>;
}
