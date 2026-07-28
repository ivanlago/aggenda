import {
  ArrowRight,
  CalendarCheck,
  Check,
  Clock3,
  MessageCircle,
  Scissors,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";

const audiences = [
  { label: "Estética", icon: Sparkles },
  { label: "Salões", icon: Scissors },
  { label: "Barbearias", icon: Scissors },
  { label: "Oficinas", icon: Wrench },
  { label: "Escritórios", icon: UsersRound },
];

const appointments = [
  { time: "09:00", name: "Marina Souza", service: "Atendimento", color: "bg-[#dff4e8]" },
  { time: "10:30", name: "Carlos Lima", service: "Serviço recorrente", color: "bg-[#eef7cb]" },
  { time: "14:00", name: "Ana Ferreira", service: "Avaliação", color: "bg-[#f4e6d9]" },
];

export default function Home() {
  return (
    <main className="overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a href="#" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-accent">
            <CalendarCheck className="size-5" />
          </span>
          Aggenda
        </a>
        <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
          <a href="#recursos" className="transition hover:text-brand">Recursos</a>
          <a href="#para-quem" className="transition hover:text-brand">Para quem</a>
          <a href="#comecar" className="transition hover:text-brand">Como funciona</a>
        </nav>
        <a
          href="/entrar"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand"
        >
          Começar agora
        </a>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pb-32 lg:pt-24">
        <div className="relative z-10">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-brand backdrop-blur">
            <span className="size-2 rounded-full bg-brand" />
            Feito para quem atende
          </div>
          <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.03] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            Seu tempo organizado.{" "}
            <span className="text-brand">Seu negócio em movimento.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted">
            Agenda, clientes, serviços e equipe em um só lugar. Menos mensagens
            desencontradas, mais tempo para fazer o que você faz melhor.
          </p>
          <div id="comecar" className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="/entrar"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-7 py-4 font-bold text-white shadow-[0_16px_40px_-18px_#18664a] transition hover:-translate-y-0.5 hover:bg-brand-dark"
            >
              Conhecer a experiência <ArrowRight className="size-4" />
            </a>
            <span className="inline-flex items-center justify-center gap-2 px-5 py-4 text-sm font-semibold text-muted">
              <Check className="size-4 text-brand" /> Configure no seu ritmo
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -left-14 top-16 size-36 rounded-full bg-accent/70 blur-3xl" />
          <div className="absolute -right-10 bottom-10 size-52 rounded-full bg-[#b9e1cf] blur-3xl" />
          <div className="relative rotate-1 rounded-[2rem] border border-white/70 bg-white/85 p-4 shadow-[0_40px_100px_-40px_rgba(14,63,46,.45)] backdrop-blur">
            <div className="rounded-[1.4rem] bg-[#f2f5f0] p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted">Hoje</p>
                  <h2 className="mt-1 text-2xl font-extrabold">Terça, 28 de julho</h2>
                </div>
                <div className="grid size-12 place-items-center rounded-2xl bg-brand text-white">
                  <CalendarCheck className="size-6" />
                </div>
              </div>
              <div className="mt-7 space-y-3">
                {appointments.map((appointment) => (
                  <div key={appointment.time} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
                    <div className="w-14 text-sm font-extrabold text-brand">{appointment.time}</div>
                    <div className={`h-10 w-1 rounded-full ${appointment.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{appointment.name}</p>
                      <p className="text-sm text-muted">{appointment.service}</p>
                    </div>
                    <span className="rounded-full bg-[#edf7f1] px-3 py-1 text-xs font-bold text-brand">Confirmado</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-brand p-4 text-white">
                  <Clock3 className="size-5 text-accent" />
                  <p className="mt-5 text-2xl font-extrabold">6</p>
                  <p className="text-xs text-white/70">atendimentos hoje</p>
                </div>
                <div className="rounded-2xl bg-accent p-4 text-brand-dark">
                  <MessageCircle className="size-5" />
                  <p className="mt-5 text-2xl font-extrabold">4</p>
                  <p className="text-xs text-brand-dark/65">confirmados agora</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="para-quem" className="border-y bg-white/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-5 px-6">
          <p className="w-full text-center text-xs font-bold uppercase tracking-[0.2em] text-muted lg:w-auto">
            Uma agenda, muitos negócios
          </p>
          {audiences.map(({ label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 font-bold text-foreground/75">
              <Icon className="size-4 text-brand" />
              {label}
            </div>
          ))}
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="max-w-2xl">
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-brand">O essencial, bem feito</p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">
            Tudo conversa. Você não precisa correr atrás.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: CalendarCheck,
              title: "Agenda clara",
              text: "Visualize equipe, horários e serviços sem sobreposição ou improviso.",
            },
            {
              icon: UsersRound,
              title: "Clientes por perto",
              text: "Histórico, contatos e preferências organizados para um atendimento melhor.",
            },
            {
              icon: MessageCircle,
              title: "Confirmações automáticas",
              text: "Reduza faltas e o trabalho manual com lembretes no momento certo.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="group rounded-[1.7rem] border bg-white p-7 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5">
              <div className="grid size-12 place-items-center rounded-2xl bg-[#edf7f1] text-brand transition group-hover:bg-brand group-hover:text-white">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-8 text-xl font-extrabold">{title}</h3>
              <p className="mt-3 leading-7 text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
