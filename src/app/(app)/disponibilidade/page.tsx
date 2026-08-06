import { and, eq, gte } from "drizzle-orm";
import { CalendarClock, Trash2 } from "lucide-react";

import {
  createAvailabilityException,
  deleteAvailabilityException,
  deleteWeeklyAvailability,
  saveWeeklyAvailability,
} from "@/actions/schedule";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import {
  availabilityExceptions,
  professionals,
  weeklyAvailability,
} from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";

export const metadata = { title: "Disponibilidade" };

const days = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ professionalId?: string }> }) {
  const { organization } = await requireOrganization();
  const selectedProfessionalId = (await searchParams).professionalId ?? "";
  const [professionalItems, ranges, exceptions] = await Promise.all([
    db
      .select()
      .from(professionals)
      .where(
        and(
          eq(professionals.organizationId, organization.id),
          eq(professionals.isActive, true),
          eq(professionals.isBookable, true)
        )
      )
      .orderBy(professionals.name),
    db
      .select({
        id: weeklyAvailability.id,
        dayOfWeek: weeklyAvailability.dayOfWeek,
        startsAt: weeklyAvailability.startsAt,
        endsAt: weeklyAvailability.endsAt,
        professional: professionals.name,
      })
      .from(weeklyAvailability)
      .leftJoin(
        professionals,
        eq(professionals.id, weeklyAvailability.professionalId)
      )
      .where(eq(weeklyAvailability.organizationId, organization.id))
      .orderBy(
        weeklyAvailability.dayOfWeek,
        weeklyAvailability.startsAt
      ),
    db
      .select({
        id: availabilityExceptions.id,
        startsAt: availabilityExceptions.startsAt,
        endsAt: availabilityExceptions.endsAt,
        type: availabilityExceptions.type,
        reason: availabilityExceptions.reason,
        professional: professionals.name,
      })
      .from(availabilityExceptions)
      .leftJoin(
        professionals,
        eq(professionals.id, availabilityExceptions.professionalId)
      )
      .where(
        and(
          eq(availabilityExceptions.organizationId, organization.id),
          gte(availabilityExceptions.endsAt, new Date())
        )
      )
      .orderBy(availabilityExceptions.startsAt),
  ]);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Agenda"
        title="Disponibilidade"
        description="Defina jornadas recorrentes, intervalos, férias e bloqueios. Todos os canais usarão estas regras."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel">
          <h2 className="text-lg font-extrabold">Jornada semanal</h2>
          <form
            action={saveWeeklyAvailability}
            className="mt-5 grid gap-3 sm:grid-cols-2"
          >
            <select className="field sm:col-span-2" name="professionalId" required defaultValue={selectedProfessionalId}>
              <option value="">Selecione o profissional</option>
              {professionalItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select className="field" name="dayOfWeek" defaultValue="1">
              {days.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className="field" name="startsAt" type="time" required />
              <input className="field" name="endsAt" type="time" required />
            </div>
            <button
              className="primary-button sm:col-span-2"
              disabled={!professionalItems.length}
            >
              Adicionar jornada
            </button>
          </form>
          <div className="mt-6 divide-y">
            {ranges.map((range) => (
              <div
                key={range.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-bold">{range.professional ?? "Toda a equipe"}</p>
                  <p className="text-sm text-muted">
                    {days[range.dayOfWeek]} · {range.startsAt} às {range.endsAt}
                  </p>
                </div>
                <form action={deleteWeeklyAvailability}>
                  <input type="hidden" name="id" value={range.id} />
                  <button className="icon-button" aria-label="Excluir jornada">
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
            ))}
            {!ranges.length && (
              <p className="empty-state">Nenhuma jornada configurada.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="text-lg font-extrabold">Exceções e bloqueios</h2>
          <form action={createAvailabilityException} className="mt-5 grid gap-3">
            <select className="field" name="professionalId">
              <option value="">Toda a organização</option>
              {professionalItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select className="field" name="type" defaultValue="blocked">
              <option value="blocked">Bloquear período</option>
              <option value="available">Liberar período extraordinário</option>
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-bold">
                Início
                <input className="field" name="startsAt" type="datetime-local" required />
              </label>
              <label className="grid gap-1 text-xs font-bold">
                Fim
                <input className="field" name="endsAt" type="datetime-local" required />
              </label>
            </div>
            <input className="field" name="reason" placeholder="Motivo (opcional)" />
            <button className="primary-button">Adicionar exceção</button>
          </form>
          <div className="mt-6 divide-y">
            {exceptions.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex gap-3">
                  <CalendarClock className="mt-1 size-4 text-brand" />
                  <div>
                    <p className="font-bold">
                      {item.type === "blocked" ? "Bloqueado" : "Disponível"} ·{" "}
                      {item.professional ?? "Toda a organização"}
                    </p>
                    <p className="text-sm text-muted">
                      {formatOrganizationDateTime(item.startsAt, organization.timezone)} até{" "}
                      {formatOrganizationDateTime(item.endsAt, organization.timezone)}
                    </p>
                    {item.reason && <p className="text-xs text-muted">{item.reason}</p>}
                  </div>
                </div>
                <form action={deleteAvailabilityException}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label="Excluir exceção">
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
            ))}
            {!exceptions.length && (
              <p className="empty-state">Nenhuma exceção futura.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
