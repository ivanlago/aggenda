import { PaginatedCollection } from "@/components/paginated-collection";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { PortalPatients } from "@/lib/portal-patients";
import { setPortalDependent } from "@/actions/portal-dependents";
import { ActionForm } from "./action-form";

export async function PortalDependents({ organizationId, guardianId }: { organizationId: string; guardianId: string }) {
  const [dependents, candidates] = await Promise.all([
    new PortalPatients(db).list(organizationId, guardianId),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.organizationId, organizationId), ne(clients.id, guardianId))).orderBy(clients.name),
  ]);
  return <details className="panel mb-5"><summary className="cursor-pointer text-lg font-extrabold">Dependentes no portal do cliente</summary><p className="mt-3 text-sm text-muted">Este cliente poderá consultar e gerenciar os agendamentos dos dependentes vinculados. O vínculo não libera prontuários ou documentos clínicos. Confira a identidade e a autorização antes de conceder acesso.</p><PaginatedCollection label="Registros" className="mt-4 grid gap-3">{dependents.map(item => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={item.id}><span className="font-bold">{item.name}</span><ActionForm action={setPortalDependent} successMessage="Acesso do responsável removido."><input type="hidden" name="guardianId" value={guardianId} /><input type="hidden" name="clientId" value={item.id} /><input type="hidden" name="revoke" value="1" /><button className="secondary-button">Remover vínculo</button></ActionForm></div>)}</PaginatedCollection><ActionForm action={setPortalDependent} successMessage="Dependente vinculado ao responsável." className="mt-4 grid gap-3"><input type="hidden" name="guardianId" value={guardianId} /><label className="grid gap-2 text-sm font-bold">Dependente já cadastrado<select name="clientId" className="field" required defaultValue=""><option value="">Selecione o dependente</option>{candidates.filter(item => !dependents.some(dep => dep.id === item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="flex items-start gap-2 text-sm"><input name="authorized" type="checkbox" required />Conferi a identidade e a autorização deste responsável para gerenciar os agendamentos do dependente.</label><button className="primary-button w-fit">Autorizar vínculo</button></ActionForm></details>;
}
