"use client";

import { useState } from "react";

import { registerAppointmentPayment } from "@/actions/app";
import { ActionForm } from "@/components/action-form";

export function AppointmentPaymentForm({ appointmentId, client, description, defaultAmount }: { appointmentId: string; client: string; description: string; defaultAmount: string }) {
  const [method, setMethod] = useState("");
  return <ActionForm action={registerAppointmentPayment} successMessage="Pagamento registrado com sucesso." className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <label className="grid gap-2 text-sm font-bold">Cliente<input className="field" value={client} readOnly /></label>
    <label className="grid gap-2 text-sm font-bold">Descrição do atendimento<input className="field" value={description} readOnly /></label>
    <label className="grid gap-2 text-sm font-bold">Valor<input className="field" name="amount" inputMode="decimal" defaultValue={defaultAmount} required /></label>
    <label className="grid gap-2 text-sm font-bold">Forma de pagamento<select className="field" name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)} required><option value="">Selecione</option><option value="cash">Espécie</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="pix">PIX</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outros</option></select></label>
    {method === "other" && <label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição da forma de pagamento<input className="field" name="otherPaymentMethod" required /></label>}
    <button className="primary-button sm:col-span-2 sm:w-fit">Registrar pagamento</button>
  </ActionForm>;
}
