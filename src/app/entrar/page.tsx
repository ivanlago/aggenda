import { CalendarCheck, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";

import { AuthForm } from "./auth-form";

export const metadata = { title: "Entrar" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const session = await getSession();
  const requestedCallback = (await searchParams).callbackURL;
  const callbackURL =
    requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
      ? requestedCallback
      : undefined;
  if (session?.user) redirect(callbackURL || "/dashboard");

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3 text-xl font-extrabold">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-brand-dark">
            <CalendarCheck className="size-5" />
          </span>
          Aggenda
        </Link>
        <div className="max-w-lg">
          <h1 className="text-5xl font-extrabold tracking-[-0.05em]">
            Seu negócio começa com uma agenda organizada.
          </h1>
          <div className="mt-8 space-y-4 text-white/80">
            {["Equipe e serviços em um só lugar", "Clientes sempre por perto", "Agendamentos sem desencontro"].map((item) => (
              <p key={item} className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-accent" /> {item}
              </p>
            ))}
          </div>
        </div>
        <p className="text-sm text-white/60">Aggenda — seu negócio em movimento.</p>
      </section>
      <section className="grid place-items-center px-6 py-12">
        <div className="w-full max-w-md rounded-[2rem] border bg-white p-8 shadow-xl shadow-brand/5 sm:p-10">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="flex items-center gap-2 font-extrabold">
              <CalendarCheck className="size-6 text-brand" /> Aggenda
            </Link>
          </div>
          <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-brand">
            Bem-vindo
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight">
            Entre para organizar sua rotina
          </h2>
          <p className="mt-3 mb-8 leading-7 text-muted">
            Acesse com e-mail e senha ou crie seu espaço.
          </p>
          <AuthForm
            callbackURL={callbackURL}
            googleEnabled={Boolean(
              process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            )}
          />
          <p className="mt-6 text-center text-xs leading-5 text-muted">
            Ao continuar, você concorda com os termos e a política de privacidade do Aggenda.
          </p>
        </div>
      </section>
    </main>
  );
}
