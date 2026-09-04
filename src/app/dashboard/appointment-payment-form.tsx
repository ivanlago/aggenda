"use client";

import { useState } from "react";

import { registerAppointmentPayment } from "@/actions/app";
import { ActionForm } from "@/components/action-form";

export function AppointmentPaymentForm({ appointmentId, client, description, defaultAmount, packages }: { appointmentId: string; client: string; description: string; defaultAmount: string; packages: Array<{ id: string; name: string; remaining: number; current: boolean }> }) {
  const [method, setMethod] = useState("");
  return <ActionForm action={registerAppointmentPayment} successMessage="Pagamento registrado com sucesso." className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <label className="grid gap-2 text-sm font-bold">Cliente<input className="field" value={client} readOnly /></label>
    <label className="grid gap-2 text-sm font-bold">Descrição do atendimento<input className="field" value={description} readOnly /></label>
    {packages.length > 0 && <div className="rounded-2xl bg-emerald-50 p-4 text-sm sm:col-span-2"><p className="font-extrabold text-emerald-900">Saldo de pacote disponível para este procedimento</p>{packages.map((item) => <p className="mt-1 text-emerald-800" key={item.id}>{item.name}: <strong>{item.current ? "já vinculado a este atendimento" : `${item.remaining} ${item.remaining === 1 ? "sessão" : "sessões"}`}</strong></p>)}</div>}
    <label className="grid gap-2 text-sm font-bold">Valor<input className="field" name={method === "package" ? undefined : "amount"} inputMode="decimal" defaultValue={defaultAmount} readOnly={method === "package"} required={method !== "package"} /></label>
    <label className="grid gap-2 text-sm font-bold">Forma de pagamento<select className="field" name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)} required><option value="">Selecione</option>{packages.length > 0 && <option value="package">Saldo de pacote</option>}<option value="cash">Espécie</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="pix">PIX</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outros</option></select></label>
    {method === "package" && <label className="grid gap-2 text-sm font-bold sm:col-span-2">Pacote<select className="field" name="clientPackageId" required defaultValue=""><option value="" disabled>Selecione o pacote</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.current ? "já vinculado" : `${item.remaining} disponível(is)`}</option>)}</select></label>}
    {method === "other" && <label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição da forma de pagamento<input className="field" name="otherPaymentMethod" required /></label>}
    <button className="primary-button sm:col-span-2 sm:w-fit">Registrar pagamento</button>
  </ActionForm>;
}
