import QRCode from "qrcode";
import { DirectPixPayment } from "@/components/direct-pix-payment";
import { directPixReservation } from "@/lib/booking-payment";

export async function BookingPixPanel({ token, metadata, status, depositStatus, amountInCents, expiresAt, timezone }: {
  token: string; metadata: Record<string, unknown> | null; status: string; depositStatus: string; amountInCents: number; expiresAt: Date | null; timezone: string;
}) {
  const pix = directPixReservation(metadata);
  if (!pix) {
    const online = metadata?.onlinePayment as { chargeId?: unknown } | undefined;
    if (typeof online?.chargeId !== "string") return null;
    const { BookingOnlinePanel } = await import("./booking-online-panel");
    return <BookingOnlinePanel chargeId={online.chargeId} status={status} expiresAt={expiresAt} timezone={timezone} />;
  }
  const state = ["cancelled", "completed", "no_show"].includes(status) && depositStatus !== "paid" ? "cancelled" : depositStatus;
  const qrCode = state === "direct_pending" && expiresAt && expiresAt > new Date() ? await QRCode.toDataURL(pix.payload, { width: 240, margin: 2, errorCorrectionLevel: "M" }) : "";
  return <DirectPixPayment token={token} payload={pix.payload} qrCode={qrCode} pixKey={pix.key} receiverName={pix.receiverName} amountInCents={amountInCents} expiresAt={expiresAt?.toISOString() ?? null} status={state} timezone={timezone} />;
}
