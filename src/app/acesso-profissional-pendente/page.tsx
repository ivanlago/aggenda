import { CalendarCheck, Link2 } from "lucide-react";

import { SignOutButton } from "@/components/sign-out-button";
import { requireOrganizationMembership } from "@/lib/session";

export const metadata = { title: "Vínculo profissional pendente" };

export default async function PendingProfessionalAccessPage() {
  const { session, organization } = await requireOrganizationMembership();

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="panel w-full max-w-xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
          <Link2 className="size-6" />
        </span>
        <p className="mt-5 text-sm font-extrabold uppercase tracking-widest text-brand">
          Acesso recebido
        </p>
        <h1 className="mt-3 text-3xl font-extrabold">Falta vincular seu perfil profissional</h1>
        <p className="mt-4 leading-7 text-muted">
          A conta <strong>{session.user.email}</strong> já faz parte de <strong>{organization.name}</strong>,
          mas ainda não foi associada ao profissional correspondente. Peça ao administrador para abrir
          <strong> Equipe e acesso</strong>, selecionar seu nome profissional e salvar.
        </p>
        <div className="mt-7 flex justify-center">
          <SignOutButton />
        </div>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted">
          <CalendarCheck className="size-4" /> Seus dados permanecem preservados até a conclusão do vínculo.
        </p>
      </section>
    </main>
  );
}
