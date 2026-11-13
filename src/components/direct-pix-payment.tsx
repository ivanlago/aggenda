"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function DirectPixPayment({ token, payload, qrCode, receiverName, pixKey, amountInCents, expiresAt, status, timezone }: {
  token: string; payload: string; qrCode: string; receiverName: string; pixKey: string; amountInCents: number; expiresAt: string | null; status: string; timezone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expired, setExpired] = useState(() => !expiresAt || new Date(expiresAt) <= new Date());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => { setExpired(true); router.refresh(); }, Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt, router]);
  async function report() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/public/appointments/${encodeURIComponent(token)}/pix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "report_paid" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Pagamento informado. Aguarde a equipe conferir o crédito e confirmar o agendamento."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível informar o pagamento."); }
    finally { setBusy(false); }
  }
  if (status === "paid") return <p className="mt-4 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-800">Pix conferido pela equipe. Sinal recebido.</p>;
  if (status === "direct_review") return <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm"><strong>Aguardando conferência do Pix pela equipe</strong><p className="mt-1">Você informou o pagamento. Não pague novamente. A confirmação aparecerá aqui após a conferência do crédito.</p><button type="button" className="secondary-button mt-3" onClick={() => router.refresh()}>Atualizar situação</button></div>;
  if (status !== "direct_pending" || expired) return <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">Esta reserva não está disponível para pagamento. Não pague este Pix. Se já transferiu, entre em contato com a equipe.</p>;
  return <section className="mt-4 grid gap-3 rounded-xl border p-4">
    <h2 className="font-extrabold">Pagar sinal por Pix</h2>
    <p className="text-xl font-extrabold text-brand">{(amountInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
    <p className="text-sm font-bold text-brand">Pague até {new Date(expiresAt!).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" })} para confirmar o horário.</p>
    {/* Generated locally from this reservation; no external QR service receives the Pix key. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={qrCode} width={240} height={240} alt="QR Code Pix do sinal deste agendamento" className="mx-auto" />
    <p className="break-words text-sm">Titular: <strong>{receiverName}</strong><br />Chave Pix: {pixKey}</p>
    <label className="grid gap-2 text-sm font-bold">Pix Copia e Cola<textarea className="field min-h-24 break-all text-xs" readOnly value={payload} onFocus={event => event.target.select()} /></label>
    <button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(payload); setMessage("Código Pix copiado."); } catch { setMessage("Selecione e copie o código Pix acima."); } }}>Copiar código Pix</button>
    <p className="text-sm text-muted">Após pagar, clique em “Já fiz o Pix”. Confira o titular no aplicativo do banco. A equipe confirmará o agendamento após conferir o crédito.</p>
    <button type="button" className="primary-button" disabled={busy} onClick={report}>{busy ? "Informando…" : "Já fiz o Pix"}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
