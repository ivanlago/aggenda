"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, LoaderCircle } from "lucide-react";
import { configureCustomDomain } from "@/actions/custom-domains";
import type { DomainState } from "@/lib/custom-domain-rules";
import { CopyButton } from "@/components/copy-button";

const statuses = { empty: "Não configurado", pending: "Configuração pendente", ownership: "Aguardando confirmação de propriedade", dns: "Aguardando DNS", https: "Aguardando HTTPS", connected: "Conectado" };

export function CustomDomainSettings({ initial, defaultUrl, canManage, integrationReady }: { initial: DomainState; defaultUrl: string; canManage: boolean; integrationReady: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [domain, setDomain] = useState(initial.domain ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const currentUrl = state.status === "connected" && state.domain ? `https://${state.domain}` : defaultUrl;
  async function run(intent: "connect" | "verify" | "disconnect") {
    setPending(intent); setError("");
    try {
      const form = new FormData(); form.set("intent", intent); form.set("domain", state.domain ?? domain);
      const result = await configureCustomDomain(form);
      if (result.state) { setState(result.state); setDomain(result.state.domain ?? ""); setConfirmDisconnect(false); router.refresh(); }
      if (result.error) setError(result.error);
    } catch { setError("Não foi possível concluir. Confira sua conexão e tente novamente."); }
    finally { setPending(null); }
  }
  return <div className="mt-2">
    <div className="flex items-center gap-2"><a className="min-w-0 break-all text-sm text-brand underline underline-offset-4" href={currentUrl} target="_blank" rel="noopener noreferrer">{currentUrl}</a><CopyButton value={currentUrl} label="Copiar link de agendamento" iconOnly /></div>
    <div className="mt-6 rounded-2xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-extrabold"><Globe className="size-5" />Domínio próprio</h3><span className={`status-pill ${state.status === "connected" ? "text-emerald-700" : ""}`} role="status">{statuses[state.status]}</span></div>
      <p className="mt-2 text-sm text-muted">Use um endereço da sua empresa, como agenda.suaclinica.com.br. Você configura a conexão aqui e adiciona os registros DNS no provedor onde administra seu domínio.</p>
      {!integrationReady && <p className="mt-3 text-sm text-muted">A conexão de domínios ainda precisa ser ativada pela equipe do Aggenda. Seu endereço padrão continua funcionando.</p>}
      <form className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void run("connect"); }}>
        <label className="grid w-full min-w-0 flex-1 gap-2 text-sm font-bold">Endereço do domínio<input className="field" name="domain" placeholder="agenda.suaclinica.com.br" autoCapitalize="none" autoCorrect="off" value={domain} onChange={(event) => setDomain(event.target.value)} disabled={!canManage || Boolean(state.domain) || Boolean(pending) || !integrationReady} required /></label>
        {canManage && !state.domain && <button className="primary-button shrink-0" disabled={Boolean(pending) || !integrationReady}>{pending === "connect" ? "Conectando…" : "Conectar domínio"}</button>}
      </form>
      {state.records.length > 0 && <div className="mt-5"><h4 className="font-bold">Registros DNS necessários</h4><p className="mt-2 text-sm text-muted">Adicione os registros abaixo no painel do seu domínio. Se o provedor já acrescenta o domínio ao nome, informe apenas a parte anterior. Para o domínio principal, o nome costuma ser @. Não remova registros de e-mail.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Tipo</th><th className="p-2">Nome</th><th className="p-2">Valor</th></tr></thead><tbody>{state.records.map((record) => <tr className="border-b align-top" key={`${record.type}:${record.name}:${record.value}`}><td className="p-2 font-bold">{record.type}</td><td className="p-2"><div className="flex items-center gap-2"><code className="break-all">{record.name}</code><CopyButton value={record.name} label="Copiar nome do registro" iconOnly /></div><p className="mt-1 text-xs text-muted">{record.purpose}</p></td><td className="p-2"><div className="flex items-center gap-2"><code className="break-all">{record.value}</code><CopyButton value={record.value} label="Copiar valor do registro" iconOnly /></div></td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-muted">A atualização do DNS pode levar algumas horas. Se usar Cloudflare, configure o registro de agendamento como “Somente DNS” durante a conexão.</p></div>}
      {state.status === "https" && <p className="mt-4 text-sm text-muted">O domínio foi confirmado e o DNS está correto. O certificado HTTPS ainda está sendo preparado; verifique novamente em alguns instantes.</p>}
      {state.status === "connected" && <p className="mt-4 text-sm text-emerald-700">Domínio confirmado, DNS correto e HTTPS ativo. O endereço próprio já pode ser compartilhado.</p>}
      {state.message && !error && <p className="mt-3 text-sm" role="status">{state.message}</p>}
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      {canManage && state.domain && <div className="mt-4 flex flex-wrap items-center gap-3"><button className="secondary-button" type="button" onClick={() => void run("verify")} disabled={Boolean(pending) || !integrationReady}>{pending && <LoaderCircle className="mr-2 size-4 animate-spin" />}{pending === "verify" ? "Verificando…" : "Verificar conexão"}</button><button type="button" className="secondary-button" onClick={() => setConfirmDisconnect(true)} disabled={Boolean(pending) || !integrationReady}>Desconectar domínio</button></div>}
      {confirmDisconnect && <div className="mt-4 rounded-xl border p-3"><p className="text-sm">O agendamento voltará a usar o endereço padrão do Aggenda. Confirmar a desconexão?</p><div className="mt-3 flex gap-2"><button className="secondary-button" type="button" disabled={Boolean(pending)} onClick={() => void run("disconnect")}>{pending === "disconnect" ? "Desconectando…" : "Confirmar desconexão"}</button><button className="secondary-button" type="button" disabled={Boolean(pending)} onClick={() => setConfirmDisconnect(false)}>Manter domínio</button></div></div>}
    </div>
  </div>;
}
