"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { createVoucher, queueVoucherCampaign, resumeVoucherDeliveries, toggleVoucher } from "@/actions/vouchers";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { voucherMessage } from "@/lib/voucher-rules";

type Client = { id: string; name: string; email: string | null; phone: string | null; lastCompleted: string | null };
type Voucher = { id: string; code: string; description: string | null; benefit: string; clientId: string | null; isActive: boolean; validFrom: string; validUntil: string | null; usedCount: number; maxUses: number | null; bookingUrl: string };
type Delivery = { id: string; voucherCode: string; clientName: string; campaignName: string; channel: string; status: string; lastError: string | null; createdAt: string; sentAt: string | null };
type Redemption = { id: string; voucherCode: string; clientName: string; discount: number; createdAt: string };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const deliveryStatus: Record<string, string> = { pending: "Na fila", processing: "Enviando", sent: "Enviado ao serviço", failed: "Falhou", cancelled: "Cancelado" };

export function VoucherManager({ organizationName, timezone, referenceTime, vouchers, clients, deliveries, redemptions, channels, canCreate, canSend }: {
  organizationName: string; timezone: string; vouchers: Voucher[]; clients: Client[]; deliveries: Delivery[]; redemptions: Redemption[];
  channels: { email: boolean; whatsapp: boolean }; canCreate: boolean; canSend: boolean; referenceTime: number;
}) {
  const router = useRouter();
  const pendingCount = deliveries.filter((row) => row.status === "pending" || row.status === "processing").length;
  useEffect(() => {
    if (!pendingCount) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [pendingCount, router]);
  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [voucherId, setVoucherId] = useState("");
  const [channel, setChannel] = useState(channels.email ? "email" : "manual");
  const [segment, setSegment] = useState("individual");
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const voucher = vouchers.find((row) => row.id === voucherId);
  const date = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: timezone });
  const usable = (row: Voucher) => row.isActive && new Date(row.validFrom).getTime() <= referenceTime && (!row.validUntil || new Date(row.validUntil).getTime() >= referenceTime) && (row.maxUses === null || row.usedCount < row.maxUses);
  const eligible = clients.filter((client) => (!voucher?.clientId || voucher.clientId === client.id)
    && (channel === "email" ? Boolean(client.email) : Boolean(client.phone))
    && (segment !== "inactive" || (client.lastCompleted !== null && new Date(client.lastCompleted).getTime() < referenceTime - days * 86_400_000))
    && (segment !== "never" || !client.lastCompleted));
  const visible = eligible.filter((client) => `${client.name} ${client.email || ""} ${client.phone || ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const recipients = eligible.filter((client) => selected.includes(client.id));
  const message = (client: Client) => voucher ? voucherMessage({ clientName: client.name, organizationName, benefit: voucher.benefit, code: voucher.code,
    validity: voucher.validUntil ? `Válido até ${date(voucher.validUntil)}` : "Sem prazo de validade", url: voucher.bookingUrl, exclusive: Boolean(voucher.clientId) }) : "";
  function reset() { setSelected([]); }
  return <section id="vouchers" className="mt-5 grid gap-5 scroll-mt-5">
    {canCreate && <div className="grid gap-3">
      <button type="button" className="primary-button w-fit gap-2" aria-expanded={createOpen} aria-controls="new-voucher-form" onClick={() => setCreateOpen(!createOpen)}>+ Novo voucher<ChevronDown className={`size-4 transition-transform ${createOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button>
      <div id="new-voucher-form" hidden={!createOpen}>
      <ActionForm action={createVoucher} successMessage="Voucher criado." className="panel form-stack">
      <h2 className="text-xl font-extrabold">Novo voucher</h2><p className="text-sm text-muted">Crie um código público de campanha ou um benefício exclusivo para um cliente. O envio é feito separadamente.</p>
      <div className="grid gap-4 lg:grid-cols-2"><label className="grid gap-2 text-sm font-bold">Código<input className="field" name="code" required minLength={3} maxLength={40} placeholder="VOLTE10" /></label><label className="grid gap-2 text-sm font-bold">Descrição<input className="field" name="description" maxLength={300} placeholder="Campanha de retorno" /></label></div>
      <div className="grid gap-4 lg:grid-cols-4"><label className="grid gap-2 text-sm font-bold">Tipo de desconto<select className="field" name="discountType"><option value="fixed">Valor em reais</option><option value="percentage">Percentual</option></select></label><label className="grid gap-2 text-sm font-bold">Benefício (R$ ou %)<input className="field" name="discountValue" required inputMode="decimal" placeholder="10,00" /></label><label className="grid gap-2 text-sm font-bold">Limite total de usos<input className="field" name="maxUses" type="number" min={1} placeholder="Sem limite" /></label><label className="grid gap-2 text-sm font-bold">Válido até<input className="field" name="validUntil" type="date" /></label></div>
      <label className="grid gap-2 text-sm font-bold">Quem pode usar?<select className="field" name="clientId" defaultValue=""><option value="">Qualquer cliente com o código</option>{clients.map((client) => <option key={client.id} value={client.id}>Exclusivo: {client.name}</option>)}</select><span className="font-normal text-muted">Um voucher exclusivo fica vinculado ao cadastro do cliente e tem um uso por padrão, se o limite não for informado.</span></label><button className="primary-button w-fit">Criar voucher</button>
    </ActionForm></div></div>}
    <article className="panel"><h2 className="text-xl font-extrabold">Vouchers disponíveis</h2><div className="mt-4 grid gap-3">{vouchers.map((row) => <div key={row.id} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_auto]">
      <div><div className="flex flex-wrap items-center gap-2"><strong>{row.code}</strong><span className="status-pill">{usable(row) ? "Disponível" : !row.isActive ? "Desativado" : row.maxUses !== null && row.usedCount >= row.maxUses ? "Esgotado" : "Expirado ou ainda não iniciado"}</span></div><p className="mt-1 font-bold text-brand">{row.benefit}</p><p className="mt-1 text-sm text-muted">{row.description || "Sem descrição"} · {row.usedCount}/{row.maxUses ?? "∞"} usos · {row.validUntil ? `Válido até ${date(row.validUntil)}` : "Sem validade definida"}</p><p className="mt-1 text-sm">{row.clientId ? `Exclusivo: ${clients.find((client) => client.id === row.clientId)?.name || "Cliente vinculado"}` : "Código público de campanha"}</p></div>
      <div className="flex flex-wrap items-center gap-2"><CopyButton value={row.code} label="Copiar código" /><CopyButton value={row.bookingUrl} label="Copiar link" />{canSend && usable(row) && <button type="button" className="secondary-button" onClick={() => { setVoucherId(row.id); reset(); setSendOpen(true); window.requestAnimationFrame(() => document.getElementById("voucher-send")?.scrollIntoView({ behavior: "smooth" })); }}>Enviar</button>}{canCreate && <ActionForm action={toggleVoucher} successMessage="Voucher atualizado."><input type="hidden" name="voucherId" value={row.id} /><input type="hidden" name="isActive" value={String(!row.isActive)} /><button className="secondary-button">{row.isActive ? "Desativar" : "Reativar"}</button></ActionForm>}</div>
    </div>)}{!vouchers.length && <p className="empty-state">Nenhum voucher criado.</p>}</div></article>
    {canSend && <div className="grid gap-3">
      <button type="button" className="primary-button w-fit gap-2" aria-expanded={sendOpen} aria-controls="voucher-campaign-form" onClick={() => setSendOpen(!sendOpen)}>Enviar voucher<ChevronDown className={`size-4 transition-transform ${sendOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button>
      <div id="voucher-campaign-form" hidden={!sendOpen}>
      <ActionForm action={queueVoucherCampaign} successMessage="Envios enfileirados." className="panel form-stack">
      <h2 id="voucher-send" className="text-xl font-extrabold scroll-mt-5">Enviar voucher / Campanha do CRM</h2><p className="text-sm text-muted">Escolha o público e revise a mensagem. Máximo de 100 destinatários por envio; o mesmo voucher não é reenviado automaticamente ao mesmo cliente no mesmo canal.</p>
      <label className="grid gap-2 text-sm font-bold">Nome da campanha<input className="field" name="campaignName" maxLength={100} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Campanha de retorno" /></label>
      <div className="grid gap-4 lg:grid-cols-3"><label className="grid gap-2 text-sm font-bold">Voucher<select className="field" name="voucherId" required value={voucherId} onChange={(event) => { setVoucherId(event.target.value); reset(); }}><option value="">Selecione</option>{vouchers.filter(usable).map((row) => <option value={row.id} key={row.id}>{row.code} · {row.benefit}</option>)}</select></label><label className="grid gap-2 text-sm font-bold">Canal<select className="field" name="channel" value={channel} onChange={(event) => { setChannel(event.target.value); reset(); }}><option value="email" disabled={!channels.email}>E-mail{!channels.email ? " — não configurado" : ""}</option><option value="whatsapp" disabled={!channels.whatsapp}>WhatsApp automático{!channels.whatsapp ? " — não configurado" : ""}</option><option value="manual">WhatsApp individual (compartilhar)</option></select></label><label className="grid gap-2 text-sm font-bold">Público<select className="field" value={segment} onChange={(event) => { setSegment(event.target.value); reset(); }}><option value="individual">Cliente individual</option><option value="all">Selecionar clientes</option><option value="inactive">Sem atendimento concluído há um período</option><option value="never">Sem atendimento concluído</option></select></label></div>
      {!channels.whatsapp && <p className="text-sm text-muted">O envio automático pelo WhatsApp requer canal Cloud API ativo e modelo de marketing aprovado para vouchers. O compartilhamento individual abre seu WhatsApp com a mensagem pronta.</p>}
      {segment === "inactive" && <label className="grid max-w-xs gap-2 text-sm font-bold">Há quantos dias?<input className="field" type="number" min={1} max={3650} value={days} onChange={(event) => { setDays(Math.max(1, Math.min(3650, Number(event.target.value) || 1))); reset(); }} /></label>}
      <label className="grid gap-2 text-sm font-bold">Buscar destinatário<input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail ou telefone" /></label>
      <div className="flex flex-wrap items-center gap-3"><strong>{recipients.length} destinatário(s) selecionado(s)</strong>{segment !== "individual" && channel !== "manual" && <button type="button" className="secondary-button" onClick={() => setSelected(visible.slice(0, 100).map((client) => client.id))}>Selecionar resultados (até 100)</button>}<button type="button" className="secondary-button" onClick={reset}>Limpar seleção</button></div>
      <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border p-3">{visible.map((client) => <label key={client.id} className="flex items-start gap-3 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(client.id)} onChange={(event) => { const single = segment === "individual" || channel === "manual"; setSelected(event.target.checked ? single ? [client.id] : [...selected, client.id].slice(0, 100) : selected.filter((id) => id !== client.id)); }} /><span className="text-sm"><strong>{client.name}</strong><span className="block text-muted">{channel === "email" ? client.email : client.phone} · Último atendimento: {client.lastCompleted ? date(client.lastCompleted) : "nenhum"}</span></span></label>)}{!visible.length && <p className="text-sm text-muted">Nenhum destinatário com contato disponível nesta seleção.</p>}</div>
      {recipients.map((client) => <input key={client.id} type="hidden" name="clientId" value={client.id} />)}
      {voucher && recipients[0] && <div className="grid gap-3 rounded-xl bg-slate-50 p-4"><strong>Prévia para {recipients[0].name}</strong><p className="whitespace-pre-wrap break-words text-sm">{message(recipients[0])}</p><p className="text-xs text-muted">Cada destinatário receberá seu próprio nome. Um envio aceito pelo serviço não confirma leitura ou entrega final.</p><div className="flex flex-wrap gap-2"><CopyButton value={message(recipients[0])} label="Copiar mensagem" />{recipients.length === 1 && recipients[0].phone && <a className="secondary-button" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${recipients[0].phone.replace(/\D/g, "").startsWith("55") ? recipients[0].phone.replace(/\D/g, "") : `55${recipients[0].phone.replace(/\D/g, "")}`}?text=${encodeURIComponent(message(recipients[0]))}`}>Abrir WhatsApp com mensagem</a>}</div></div>}
      {channel !== "manual" && <button className="primary-button w-fit" disabled={!voucher || !recipients.length}>Enviar para {recipients.length} destinatário(s)</button>}
    </ActionForm></div></div>}
    <article className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-extrabold">Histórico de envios</h2>{canSend && <ActionForm action={resumeVoucherDeliveries} successMessage="Processamento solicitado. Atualize a lista em alguns instantes."><button className="secondary-button">Processar fila / Atualizar</button></ActionForm>}</div><p className="mt-2 text-sm text-muted">Últimos 100 envios automáticos. Compartilhamentos pelo seu WhatsApp são concluídos fora do Aggenda.</p><div className="mt-4 grid gap-3">{deliveries.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><div><p className="font-bold">{row.clientName} · {row.voucherCode}</p><p className="text-xs text-muted">{row.campaignName} · {row.channel === "email" ? "E-mail" : "WhatsApp"} · {date(row.sentAt || row.createdAt)}</p>{row.lastError && <p className="mt-1 text-sm text-red-700">{row.lastError}</p>}</div><div className="flex items-center gap-2"><span className="status-pill">{deliveryStatus[row.status] || row.status}</span>{canSend && row.status === "failed" && <ActionForm action={resumeVoucherDeliveries} successMessage="Nova tentativa enfileirada."><input type="hidden" name="deliveryId" value={row.id} /><button className="secondary-button">Tentar novamente</button></ActionForm>}</div></div>)}{!deliveries.length && <p className="empty-state">Nenhum envio automático registrado.</p>}</div></article>
    <details className="panel"><summary className="cursor-pointer text-xl font-extrabold">Histórico de utilização</summary><div className="mt-4 divide-y">{redemptions.map((row) => <p key={row.id} className="py-3 text-sm"><strong>{row.voucherCode}</strong> · {row.clientName} · {money(row.discount)} de desconto · {date(row.createdAt)}</p>)}{!redemptions.length && <p className="empty-state">Nenhum uso registrado. O uso é contabilizado na confirmação do agendamento.</p>}</div></details>
  </section>;
}
