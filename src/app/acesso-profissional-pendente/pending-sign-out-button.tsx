"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function PendingSignOutButton() {
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await authClient.signOut();
    window.location.assign("/entrar");
  }

  return (
    <button
      type="button"
      className="primary-button inline-flex min-w-44 items-center justify-center gap-2"
      disabled={loading}
      onClick={signOut}
    >
      <LogOut className="size-4" />
      {loading ? "Saindo..." : "Sair e trocar de conta"}
    </button>
  );
}
