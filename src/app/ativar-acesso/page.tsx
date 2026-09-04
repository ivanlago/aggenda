import { eq } from "drizzle-orm";
import { KeyRound, Mail } from "lucide-react";
import { redirect } from "next/navigation";

import { resendAccessActivation } from "@/actions/access-activation";
import { ActionForm } from "@/components/action-form";
import { SignOutButton } from "@/components/sign-out-button";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Ative seu acesso" };

export default async function ActivateAccessPage() {
  const session = await requireSession();
  const [user] = await db
    .select({ email: users.email, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user?.mustChangePassword) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f3] px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
          <KeyRound className="size-6" />
        </span>
        <p className="mt-5 text-sm font-extrabold uppercase tracking-widest text-brand">Acesso administrativo criado</p>
        <h1 className="mt-3 text-3xl font-extrabold">Defina sua senha pelo e-mail</h1>
        <p className="mt-4 leading-7 text-muted">
          Enviamos para <strong>{user.email}</strong> um link seguro, válido por 24 horas. O painel será liberado depois que você definir a senha.
        </p>
        <ActionForm action={resendAccessActivation} successMessage="Novo link enviado." className="mt-7">
          <button className="primary-button inline-flex items-center gap-2">
            <Mail className="size-4" /> Reenviar link de acesso
          </button>
        </ActionForm>
        <div className="mt-6 flex justify-center rounded-xl bg-brand px-4 py-3">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
