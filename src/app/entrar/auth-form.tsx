"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

type Mode = "login" | "register";

export function AuthForm({
  googleEnabled,
  callbackURL,
}: {
  googleEnabled: boolean;
  callbackURL?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const result =
        mode === "login"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({
              name: String(formData.get("name") ?? "").trim(),
              email,
              password,
            });

      if (result.error) {
        setError(
          mode === "login"
            ? "E-mail ou senha inválidos."
            : result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
              ? "Já existe uma conta com este e-mail."
              : "Não foi possível criar a conta."
        );
        return;
      }

      router.push(callbackURL || (mode === "login" ? "/dashboard" : "/onboarding"));
      router.refresh();
    } catch {
      setError("Não foi possível concluir o acesso. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");

    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: callbackURL || "/dashboard",
        newUserCallbackURL: callbackURL || "/onboarding",
      });
    } catch {
      setError("Não foi possível entrar com Google.");
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 rounded-2xl bg-[#f2f5f0] p-1">
        {(["login", "register"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setMode(item);
              setError("");
            }}
            className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${
              mode === item
                ? "bg-white text-brand shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item === "login" ? "Login" : "Criar conta"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5">
        {mode === "register" && (
          <label className="grid gap-2 text-sm font-bold">
            Nome
            <input
              className="field"
              name="name"
              autoComplete="name"
              required
              placeholder="Digite seu nome"
            />
          </label>
        )}
        <label className="grid gap-2 text-sm font-bold">
          E-mail
          <input
            className="field"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="Digite seu e-mail"
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Senha
          <input
            className="field"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            placeholder="Mínimo de 8 caracteres"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-brand px-5 py-4 font-extrabold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <>
              {mode === "login" ? "Entrar" : "Criar conta"}
              <ArrowRight className="size-5" />
            </>
          )}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-muted">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-2xl border bg-white px-5 py-4 font-extrabold text-foreground transition hover:border-brand disabled:opacity-60"
          >
            Entrar com Google
          </button>
        </>
      )}
    </div>
  );
}
