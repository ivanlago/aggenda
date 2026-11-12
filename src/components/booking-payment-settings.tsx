"use client";

import { useState } from "react";
import { saveBookingPaymentSettings } from "@/actions/booking-payment";
import { ActionForm } from "@/components/action-form";
import type { BookingPaymentSettings } from "@/lib/booking-payment";

export function BookingPaymentSettingsForm({ settings, accounts }: { settings: BookingPaymentSettings; accounts: { id: string; name: string }[] }) {
  const [mode, setMode] = useState(settings.mode);
  return <ActionForm action={saveBookingPaymentSettings} successMessage="Recebimento antecipado configurado." className="panel mb-5 grid gap-4 sm:grid-cols-2">
    <h2 className="col-span-full text-lg font-extrabold">Pagamento antecipado de agendamentos</h2>
    <label className="grid gap-2 text-sm font-bold">Como receber<select className="field" name="mode" value={mode} onChange={event => setMode(event.target.value as BookingPaymentSettings["mode"])}><option value="pix_direct">Pix direto — conferência pela equipe</option><option value="integrated">Pagamento integrado — Asaas</option></select></label>
    {mode === "pix_direct" ? <>
      <label className="grid gap-2 text-sm font-bold">Conta financeira *<select className="field" name="accountId" required defaultValue={settings.accountId ?? ""}><option value="">Selecione</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold">Tipo de chave *<select className="field" name="keyType" defaultValue={settings.keyType ?? "random"}><option value="random">Chave aleatória</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option></select></label>
      <label className="grid gap-2 text-sm font-bold">Chave Pix *<input className="field" name="key" defaultValue={settings.key ?? ""} maxLength={100} required /></label>
      <label className="grid gap-2 text-sm font-bold">Titular da conta *<input className="field" name="receiverName" defaultValue={settings.receiverName ?? ""} minLength={2} maxLength={100} required /></label>
      <label className="grid gap-2 text-sm font-bold">Cidade do recebedor *<input className="field" name="city" defaultValue={settings.city ?? ""} minLength={2} maxLength={60} required /></label>
      <p className="col-span-full text-sm text-muted">Cadastre uma chave já registrada no banco da empresa. Ela será exibida ao cliente com QR Code e valor do sinal. A equipe deve conferir o crédito no banco antes de confirmar o recebimento na Agenda. A conta financeira organiza o lançamento e não altera o destino da chave.</p>
    </> : <p className="self-end text-sm text-muted">Utiliza a conta Asaas conectada abaixo, com confirmação automática do pagamento.</p>}
    <p className="col-span-full text-xs text-muted">Defina o valor ou percentual do sinal no cadastro de cada serviço. Alterações nesta configuração valem para novas reservas.</p>
    <button className="secondary-button col-span-full w-fit">Salvar recebimento antecipado</button>
  </ActionForm>;
}
