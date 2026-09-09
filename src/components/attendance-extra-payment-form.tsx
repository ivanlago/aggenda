"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { payAttendanceExtra } from "@/actions/attendance-pos";

export function AttendanceExtraPaymentForm({ appointmentId, requestId }: { appointmentId: string; requestId: string }) {
  const [id, setId] = useState(requestId);
  return <ActionForm action={payAttendanceExtra} successMessage="Pagamento adicional registrado." onSuccess={() => setId(crypto.randomUUID())} className="mt-4 grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="appointmentId" value={appointmentId} />
    <label className="grid gap-2 text-sm font-bold sm:col-span-2">Item utilizado / cobrança adicional<input className="field" name="description" required minLength={2} maxLength={300} placeholder="Ex.: material adicional utilizado no procedimento" /></label>
    <label className="grid gap-2 text-sm font-bold">Valor (R$)<input className="field" name="amount" required inputMode="decimal" placeholder="0,00" /></label>
    <label className="grid gap-2 text-sm font-bold">Forma de pagamento<select className="field" name="paymentMethod" required defaultValue=""><option value="" disabled>Selecione</option><option value="cash">Espécie</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="pix">PIX</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outros</option></select></label>
    <label className="grid gap-2 text-sm font-bold">Justificativa (se Outros)<input className="field" name="otherPaymentMethod" maxLength={200} placeholder="Justifique se necessário" /></label>
    <button className="primary-button w-fit sm:col-span-2">Registrar pagamento adicional</button>
  </ActionForm>;
}
