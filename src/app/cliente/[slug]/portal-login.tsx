"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function PortalLogin({ slug, hasChallenge, initialError }: { slug: string; hasChallenge: boolean; initialError?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(hasChallenge);
  const [message, setMessage] = useState(initialError || "");
  const [loading, setLoading] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const payload = mode === "login" ? { intent: "login", identifier } : { intent: "register", name, email, phone };
    const response = await fetch(`/api/public/client-portal/${slug}/request-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(result.error);
    setShowCode(true); setMessage(result.message);
  }
  async function verifyCode(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const response = await fetch(`/api/public/client-portal/${slug}/verify-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(result.error);
    router.refresh();
  }
  return <div className="mt-6 grid gap-5">
    <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-extrabold"><button type="button" className={`rounded-lg px-3 py-2.5 transition ${mode === "login" ? "bg-white text-brand shadow-sm" : "text-muted"}`} onClick={() => { setMode("login"); setMessage(""); }}>Já sou cliente</button><button type="button" className={`rounded-lg px-3 py-2.5 transition ${mode === "register" ? "bg-white text-brand shadow-sm" : "text-muted"}`} onClick={() => { setMode("register"); setMessage(""); }}>Primeiro acesso</button></div>
    <form className="grid gap-3" onSubmit={requestCode}>
      {mode === "login" ? <label className="grid gap-2 text-sm font-bold">E-mail ou celular<input className="field" autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="voce@email.com ou (71) 99999-9999" /></label> : <><div><h2 className="font-extrabold">Crie seu acesso</h2><p className="mt-1 text-sm leading-5 text-muted">Confirmaremos seu e-mail antes de criar o cadastro. Se você já existir, reutilizaremos seus dados.</p></div><label className="grid gap-2 text-sm font-bold">Nome completo<input className="field" autoComplete="name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="grid gap-2 text-sm font-bold">Celular com DDD<input className="field" type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(71) 99999-9999" /></label><label className="grid gap-2 text-sm font-bold">E-mail<input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label></>}
      <button className="primary-button" disabled={loading}>{loading ? "Enviando..." : mode === "login" ? "Login" : "Continuar primeiro acesso"}</button>
    </form>
    {showCode && <form className="grid gap-3 rounded-2xl border bg-[#f8faf7] p-4" onSubmit={verifyCode}>
      <div><h2 className="font-extrabold">Já recebeu o código?</h2><p className="mt-1 text-sm text-muted">Digite os seis números enviados ao seu e-mail.</p></div>
      <input className="field bg-white text-center text-xl tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" />
      <button className="secondary-button" disabled={loading || code.length !== 6}>Entrar com código</button>
    </form>}
    {message && <p className="rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">{message}</p>}
  </div>;
}

export function PortalLogout({ slug }: { slug: string }) {
  const router = useRouter();
  return <button className="secondary-button" onClick={async () => { await fetch(`/api/public/client-portal/${slug}/logout`, { method: "POST" }); router.refresh(); }}>Sair</button>;
}
