import { and, eq, gt, inArray, lt, or, isNull } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { appointments, availabilityExceptions, clients, professionals, services } from "@/db/schema";
import { deleteAvailabilityException } from "@/actions/schedule";
import { ActionForm } from "@/components/action-form";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
export async function ScheduleBlocks({ organizationId, timezone, canManage, scopeId, professionalFilter }: { organizationId: string; timezone: string; canManage: boolean; scopeId: string | null; professionalFilter?: string }) {
 const professionalId = scopeId || professionalFilter;
 const conditions = and(eq(availabilityExceptions.organizationId, organizationId), eq(availabilityExceptions.type, "blocked"), gt(availabilityExceptions.endsAt, new Date()), professionalId ? or(eq(availabilityExceptions.professionalId, professionalId), isNull(availabilityExceptions.professionalId)) : undefined);
 const [blocks, affected] = await Promise.all([
  db.select({ id: availabilityExceptions.id, startsAt: availabilityExceptions.startsAt, endsAt: availabilityExceptions.endsAt, reason: availabilityExceptions.reason, professional: professionals.name, professionalId: availabilityExceptions.professionalId }).from(availabilityExceptions).leftJoin(professionals, eq(professionals.id, availabilityExceptions.professionalId)).where(conditions).orderBy(availabilityExceptions.startsAt),
  db.select({ blockId: availabilityExceptions.id, id: appointments.id, startsAt: appointments.startsAt, client: clients.name, service: services.name }).from(availabilityExceptions).innerJoin(appointments, and(eq(appointments.organizationId, organizationId), or(eq(appointments.professionalId, availabilityExceptions.professionalId), isNull(availabilityExceptions.professionalId)), lt(appointments.startsAt, availabilityExceptions.endsAt), gt(appointments.endsAt, availabilityExceptions.startsAt), gt(appointments.endsAt, new Date()), inArray(appointments.status, ["scheduled", "confirmed"]), professionalId ? eq(appointments.professionalId, professionalId) : undefined)).innerJoin(clients, eq(clients.id, appointments.clientId)).innerJoin(services, eq(services.id, appointments.serviceId)).where(conditions).orderBy(appointments.startsAt),
 ]);
 const affectedIds = new Set(affected.map(item => item.id));
 return <section className="panel mb-5" aria-labelledby="schedule-blocks-title">
  <h2 id="schedule-blocks-title" className="text-lg font-extrabold">Bloqueios de horário</h2>
  <p className="mt-1 text-sm text-muted">{blocks.length} bloqueio(s) em andamento ou futuro(s){professionalId ? " para o profissional selecionado" : ""}.</p>
  {affectedIds.size > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900" role="status">{affectedIds.size} agendamento(s) coincidem com bloqueios e precisam de revisão.</p>}
  {blocks.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-brand">Ver bloqueios e agendamentos afetados</summary><div className="mt-3 divide-y">{blocks.map(block => <article key={block.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{block.professional ?? "Todos os profissionais"}</h3><p className="mt-1 text-sm">{formatOrganizationDateTime(block.startsAt, timezone)} até {formatOrganizationDateTime(block.endsAt, timezone)}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{block.reason || "Sem motivo informado"}</p></div>{canManage && (!scopeId || block.professionalId === scopeId) && <ActionForm action={deleteAvailabilityException} successMessage="Bloqueio removido."><input type="hidden" name="id" value={block.id} /><button className="secondary-button">Remover bloqueio</button></ActionForm>}</div>{affected.filter(item => item.blockId === block.id).map(item => <div key={item.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm"><span><strong>{item.client}</strong> · {item.service} · {formatOrganizationDateTime(item.startsAt, timezone)}</span><Link className="font-bold text-brand underline" href={`/atendimento/${item.id}`}>Revisar atendimento</Link></div>)}</article>)}</div></details>}
 </section>;
}
