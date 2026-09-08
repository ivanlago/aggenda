export function attendancePaymentState({ paymentStatus, packageStatus, appointmentStatus }: { paymentStatus?: string | null; packageStatus?: string | null; appointmentStatus: string }) {
  if (paymentStatus === "received") return "paid";
  if (packageStatus === "reserved" || packageStatus === "consumed") return "package";
  if (appointmentStatus === "cancelled" || appointmentStatus === "no_show") return "blocked";
  return "pending";
}
