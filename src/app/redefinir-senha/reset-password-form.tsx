"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    const result = await authClient.resetPassword({ newPassword, token });
    if (result.error) {
      setError("Não foi possível redefinir a senha. Solicite um novo link.");
      setLoading(false);
      return;
    }
    router.push("/entrar?senha=alterada");
  }

  return (
    <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-bold">
        Nova senha
        <input className="field" minLength={8} name="password" required type="password" autoComplete="new-password" />
      </label>
      <label className="grid gap-2 text-sm font-bold">
        Confirmar senha
        <input className="field" minLength={8} name="confirmation" required type="password" autoComplete="new-password" />
      </label>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <button className="primary-button justify-center" disabled={loading} type="submit">
        {loading ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
