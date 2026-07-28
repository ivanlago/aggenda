import { ArrowLeft, CalendarDays, Clock3, UsersRound } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Visão geral" };

export default function DashboardPreview() {
  return (
    <main className="min-h-screen bg-[#f3f5f1] p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-brand">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold text-brand">Visão geral</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Bom dia, Ivan.</h1>
            <p className="mt-2 text-muted">Esta é a primeira fundação visual do Aggenda.</p>
          </div>
          <button className="rounded-full bg-brand px-5 py-3 text-sm font-bold text-white">Novo agendamento</button>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-3">
          {[
            { icon: CalendarDays, value: "6", label: "Agendamentos hoje" },
            { icon: UsersRound, value: "42", label: "Clientes ativos" },
            { icon: Clock3, value: "87%", label: "Ocupação da semana" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="rounded-3xl border bg-white p-6">
              <Icon className="size-5 text-brand" />
              <p className="mt-7 text-3xl font-extrabold">{value}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-3xl border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Próximos atendimentos</h2>
            <span className="text-sm font-bold text-brand">Hoje</span>
          </div>
          <div className="mt-6 divide-y">
            {[
              ["09:00", "Marina Souza", "Atendimento"],
              ["10:30", "Carlos Lima", "Serviço recorrente"],
              ["14:00", "Ana Ferreira", "Avaliação"],
            ].map(([time, client, service]) => (
              <div key={time} className="grid grid-cols-[70px_1fr_auto] items-center gap-3 py-4">
                <span className="font-extrabold text-brand">{time}</span>
                <div>
                  <p className="font-bold">{client}</p>
                  <p className="text-sm text-muted">{service}</p>
                </div>
                <span className="rounded-full bg-[#edf7f1] px-3 py-1 text-xs font-bold text-brand">Confirmado</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
