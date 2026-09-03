"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function InvitationAccountButton({
  token,
  currentEmail,
  invitedEmail,
}: {
  token: string;
  currentEmail: string;
  invitedEmail: string;
}) {
  const [loading, setLoading] = useState(false);

  async function switchAccount() {
    setLoading(true);
    await authClient.signOut();
    const callbackURL = encodeURIComponent(`/convite/${token}`);
    window.location.assign(`/entrar?callbackURL=${callbackURL}`);
  }

  return (
    <div className="mt-7">
      <p className="mb-3 text-sm text-muted">
        Você está conectado como <strong>{currentEmail}</strong>. Para aceitar, entre
        com <strong>{invitedEmail}</strong>.
      </p>
      <button
        type="button"
        className="primary-button w-full"
        disabled={loading}
        onClick={switchAccount}
      >
        {loading ? "Saindo da conta atual..." : "Trocar de conta e continuar"}
      </button>
    </div>
  );
}
