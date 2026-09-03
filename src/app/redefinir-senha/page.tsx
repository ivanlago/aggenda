import Link from "next/link";

import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
    searchParams: Promise<{ token?: string; error?: string; primeiroAcesso?: string; email?: string }>;
}) {
  const { token, error, primeiroAcesso, email } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f3] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-sm">
        <Link className="text-2xl font-extrabold text-brand" href="/">
          Aggenda
        </Link>
        <h1 className="mt-8 text-2xl font-extrabold">
          {primeiroAcesso === "1" ? "Crie sua senha de acesso" : "Criar nova senha"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {primeiroAcesso === "1"
            ? "Seu acesso profissional já está vinculado. Defina uma senha segura para entrar no Aggenda."
            : "Escolha uma senha segura com pelo menos 8 caracteres."}
        </p>
        {error || !token ? (
          <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Este link é inválido ou expirou. Solicite uma nova redefinição na página de acesso.
          </div>
        ) : (
          <ResetPasswordForm token={token} firstAccess={primeiroAcesso === "1"} email={email} />
        )}
        <Link className="mt-6 inline-block text-sm font-bold text-brand" href="/entrar">
          Voltar ao acesso
        </Link>
      </section>
    </main>
  );
}
