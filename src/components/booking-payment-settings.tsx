"use client";

import { CompactSettingsRow } from "@/components/compact-settings-row";
import { useState } from "react";
import { saveBookingPaymentSettings } from "@/actions/booking-payment";
import { ActionForm } from "@/components/action-form";
import type { BookingPaymentSettings } from "@/lib/booking-payment";

export function BookingPaymentSettingsForm({ settings, accounts, defaultProviderName }: { defaultProviderName?: string; settings: BookingPaymentSettings; accounts: { id: string; name: string }[] }) {
  const [mode, setMode] = useState(settings.mode);
  return <ActionForm action={saveBookingPaymentSettings} successMessage="Recebimento antecipado configurado." className="panel mb-5 grid gap-4 sm:grid-cols-2">
    <h2 className="col-span-full text-lg font-extrabold">Pagamento antecipado de agendamentos</h2>
    <div className="col-span-full"><CompactSettingsRow>
    <label className="grid gap-2 text-sm font-bold">Como receber<select className="field" name="mode" value={mode} onChange={event => setMode(event.target.value as BookingPaymentSettings["mode"])}><option value="pix_direct">Pix direto — conferência pela equipe</option><option value="integrated">Provedor padrão de cobranças online</option></select></label>
    {mode === "integrated" && <button className="primary-button">Salvar recebimento antecipado</button>}
    </CompactSettingsRow></div>
    {mode === "pix_direct" ? <>
      <label className="grid gap-2 text-sm font-bold">Conta financeira *<select className="field" name="accountId" required defaultValue={settings.accountId ?? ""}><option value="">Selecione</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold">Tipo de chave *<select className="field" name="keyType" defaultValue={settings.keyType ?? "random"}><option value="random">Chave aleatória</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option></select></label>
      <label className="grid gap-2 text-sm font-bold">Chave Pix *<input className="field" name="key" defaultValue={settings.key ?? ""} maxLength={100} required /></label>
      <label className="grid gap-2 text-sm font-bold">Titular da conta *<input className="field" name="receiverName" defaultValue={settings.receiverName ?? ""} minLength={2} maxLength={100} required /></label>
      <label className="grid gap-2 text-sm font-bold">Cidade do recebedor *<input className="field" name="city" defaultValue={settings.city ?? ""} minLength={2} maxLength={60} required /></label>
      <p className="col-span-full text-sm text-muted">Cadastre uma chave já registrada no banco da empresa. Ela será exibida ao cliente com QR Code e valor do sinal. A equipe deve conferir o crédito no banco antes de confirmar o recebimento na Agenda. A conta financeira organiza o lançamento e não altera o destino da chave.</p>
    </> : <p className="col-span-full text-sm text-muted">{defaultProviderName ? `Utiliza ${defaultProviderName}, com confirmação automática. O cliente escolhe no checkout entre os meios disponíveis na conta, incluindo cartões quando habilitados pelo provedor.` : "Na aba Provedores de pagamento, habilite um provedor e marque-o como padrão para cobranças online antes de usar esta opção."}</p>}
    <p className="col-span-full text-xs text-muted">Defina o valor ou percentual do sinal no cadastro de cada serviço. Alterações nesta configuração valem para novas reservas.</p>
    {mode === "integrated" && <p className="col-span-full text-xs text-muted">A conta financeira será a vinculada à forma Link de pagamento em Formas de pagamento (Pix para Efí). Os meios exibidos no checkout dependem do provedor e da conta conectada.</p>}
    {mode === "pix_direct" && <div className="col-span-full flex justify-end"><button className="primary-button w-full lg:w-auto">Salvar recebimento antecipado</button></div>}
  </ActionForm>;
}
