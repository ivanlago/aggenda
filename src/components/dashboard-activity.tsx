import { organizationDate } from "@/lib/appointment-safety";

type Appointment = { startsAt: Date; status: string };
export function buildDashboardActivity(monthAppointments: Appointment[], recentAppointments: Appointment[], today: string, timezone: string) {
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    return { date: date.toISOString().slice(0, 10), completed: 0, scheduled: 0, lost: 0 };
  });
  const dayMap = new Map(daily.map(day => [day.date, day]));
  for (const appointment of recentAppointments) {
    const day = dayMap.get(organizationDate(appointment.startsAt, timezone));
    if (!day) continue;
    if (appointment.status === "completed") day.completed++;
    else if (["scheduled", "confirmed"].includes(appointment.status)) day.scheduled++;
    else if (["cancelled", "no_show"].includes(appointment.status)) day.lost++;
  }
  const todayAppointments = monthAppointments.filter(item => organizationDate(item.startsAt, timezone) === today);
  const completed = monthAppointments.filter(item => item.status === "completed").length;
  const noShow = monthAppointments.filter(item => item.status === "no_show").length;
  return {
    daily,
    today: todayAppointments.filter(item => item.status !== "cancelled").length,
    pending: todayAppointments.filter(item => item.status === "scheduled").length,
    completed,
    noShow,
    noShowRate: completed + noShow ? noShow / (completed + noShow) * 100 : null,
  };
}

export function DashboardActivity({ monthAppointments, recentAppointments, today, timezone }: { monthAppointments: Appointment[]; recentAppointments: Appointment[]; today: string; timezone: string }) {
  const activity = buildDashboardActivity(monthAppointments, recentAppointments, today, timezone);
  const max = Math.max(1, ...activity.daily.map(day => day.completed + day.scheduled + day.lost));
  const cards = [
    { label: "Agendamentos hoje", value: activity.today, hint: "Cancelados excluídos" },
    { label: "A confirmar hoje", value: activity.pending, hint: "Aguardam confirmação" },
    { label: "Concluídos no mês", value: activity.completed, hint: "Atendimentos realizados" },
    { label: "Taxa de faltas no mês", value: activity.noShowRate === null ? "—" : `${activity.noShowRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, hint: `${activity.noShow} falta(s) entre concluídos e faltas` },
  ];
  const hasMovement = activity.daily.some(day => day.completed + day.scheduled + day.lost > 0);
  return <section aria-labelledby="dashboard-activity-title">
    <h2 id="dashboard-activity-title" className="mb-3 text-lg font-extrabold">Movimento da clínica</h2>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={card.label}><p className="text-xs font-bold text-muted">{card.label}</p><p className="mt-3 text-3xl font-extrabold text-brand">{card.value}</p><p className="mt-2 text-xs text-muted">{card.hint}</p></article>)}</div>
    <div className="panel mt-4">
      <h3 className="font-extrabold">Agenda nos últimos 7 dias</h3>
      <p className="mt-1 text-xs text-muted">Quantidade de agendamentos por dia, conforme o status atual.</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">{[{ color: "bg-brand", label: "Concluídos" }, { color: "bg-sky-400", label: "Agendados / confirmados" }, { color: "bg-rose-400", label: "Cancelados / faltas" }].map(item => <span key={item.label} className="inline-flex items-center gap-1.5"><i className={`size-2.5 rounded-sm ${item.color}`} aria-hidden="true" />{item.label}</span>)}</div>
      {!hasMovement && <p className="mt-4 text-sm text-muted">Nenhum agendamento nos últimos 7 dias.</p>}
      <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-4" role="list" aria-label="Movimento diário da agenda">{activity.daily.map(day => {
        const total = day.completed + day.scheduled + day.lost;
        const label = new Date(`${day.date}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
        return <div key={day.date} role="listitem" aria-label={`${label}: ${day.completed} concluídos, ${day.scheduled} agendados ou confirmados, ${day.lost} cancelados ou faltas`} title={`${label}: ${day.completed} concluídos · ${day.scheduled} agendados/confirmados · ${day.lost} cancelados/faltas`}>
          <p className="mb-2 text-center text-xs font-bold tabular-nums">{total}</p>
          <div className="flex h-28 items-end justify-center rounded-lg bg-slate-50" aria-hidden="true"><div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${total / max * 100}%` }}><span className="bg-brand" style={{ height: `${total ? day.completed / total * 100 : 0}%` }} /><span className="bg-sky-400" style={{ height: `${total ? day.scheduled / total * 100 : 0}%` }} /><span className="bg-rose-400" style={{ height: `${total ? day.lost / total * 100 : 0}%` }} /></div></div>
          <p className={`mt-2 text-center text-[10px] sm:text-xs ${day.date === today ? "font-extrabold text-brand" : "text-muted"}`}>{label}</p>
        </div>;
      })}</div>
    </div>
  </section>;
}
