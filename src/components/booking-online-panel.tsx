import { BookingPaymentDeadline } from "@/components/booking-payment-deadline";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { paymentCharges } from "@/db/schema";
import { posProviderNames } from "@/lib/pos-providers";

export async function BookingOnlinePanel({ chargeId, status, expiresAt, timezone }: { chargeId: string; status: string; expiresAt: Date | null; timezone: string }) {
  const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.id, chargeId), eq(paymentCharges.originType, "appointment"))).limit(1);
  if (!charge) return null;
  const active = ["scheduled", "confirmed"].includes(status) && expiresAt && expiresAt > new Date();
  const paid = charge.status === "paid";
  const qr = active && charge.status === "pending" && charge.pixQrCodePayload ? await QRCode.toDataURL(charge.pixQrCodePayload, { width: 240, margin: 2 }) : null;
  return <section className="my-4 rounded-xl border p-4">
    <h3 className="font-bold">Pagamento antecipado · {posProviderNames[charge.provider] ?? charge.provider}</h3>
    <p className="mt-2 font-bold">{(charge.amountInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
    {paid ? <p>Pagamento recebido.{!active && status === "cancelled" ? " Fale com a equipe para verificar a reserva." : ""}</p> : !active ? <p>O prazo desta reserva terminou ou ela foi cancelada. Não efetue o pagamento; fale com a equipe.</p> : charge.status === "issuance_failed" ? <p>O provedor não conseguiu emitir a cobrança. Fale com a equipe antes de tentar novamente.</p> : charge.status === "pending" && (charge.invoiceUrl || qr) ? <>
      <BookingPaymentDeadline expiresAt={expiresAt!.toISOString()} timezone={timezone} /><p className="my-2 text-sm">Escolha no provedor entre os meios disponíveis para esta cobrança. A confirmação do pagamento é automática.</p>
      {charge.invoiceUrl && <a className="primary-button inline-flex" href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer">Pagar sinal</a>}
      {/* QR is generated locally; it is not an external image to optimize. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <><img src={qr} alt="QR Code Pix do sinal" width={240} height={240} /><label className="grid gap-2 text-sm">Pix copia e cola<textarea className="field" readOnly value={charge.pixQrCodePayload ?? ""} /></label></>}
    </> : <p>A emissão está em conferência. Consulte a equipe; não gere outro pagamento para esta reserva.</p>}
  </section>;
}
