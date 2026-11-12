import { confirmBookingDirectPix } from "@/actions/booking-payment";
import { ActionForm } from "@/components/action-form";

export function BookingDirectPixReview({ id, status, amountInCents, receiverName, canConfirm }: { id: string; status: string; amountInCents: number; receiverName: string; canConfirm: boolean }) {
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
    <p className="font-bold">{status === "direct_review" ? "Cliente informou o Pix — conferir no banco" : "Sinal por Pix direto — aguardando pagamento"}</p>
    <p className="mt-1">{(amountInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {receiverName}</p>
    {canConfirm && <ActionForm action={confirmBookingDirectPix} successMessage="Pix recebido e agendamento confirmado." className="mt-3 grid gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-start gap-2"><input type="checkbox" name="verified" required />Conferi o crédito deste valor no banco da empresa.</label>
      <button className="primary-button w-fit">Confirmar recebimento do Pix</button>
    </ActionForm>}
    <p className="mt-2 text-xs text-muted">O envio de comprovante ou a informação do cliente não confirma o recebimento.</p>
  </section>;
}
