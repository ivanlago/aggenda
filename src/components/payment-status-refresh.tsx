"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PaymentStatusRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let lastCheck = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < 3000) return;
      lastCheck = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pending, router]);
  if (!pending) return null;
  return <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
    <p className="font-bold" role="status">Aguardando confirmação do pagamento</p>
    <p className="mt-1">Esta página acompanha a confirmação automaticamente. Após pagar no provedor, volte a esta aba ou use o botão de voltar ao estabelecimento no checkout.</p>
    <button type="button" className="secondary-button mt-3" onClick={() => router.refresh()}>Atualizar situação</button>
  </div>;
}
