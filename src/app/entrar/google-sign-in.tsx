"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function GoogleSignIn() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
      newUserCallbackURL: "/onboarding",
    });
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-brand px-5 py-4 font-extrabold text-white transition hover:bg-brand-dark disabled:opacity-60"
    >
      {loading ? "Conectando..." : "Continuar com Google"}
      <ArrowRight className="size-5" />
    </button>
  );
}
