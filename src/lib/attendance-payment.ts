export function attendancePaymentState({ paymentStatus, packageStatus, appointmentStatus }: { paymentStatus?: string | null; packageStatus?: string | null; appointmentStatus: string }) {
  if (paymentStatus === "received") return "paid";
  if (packageStatus === "reserved" || packageStatus === "consumed") return "package";
  if (appointmentStatus === "cancelled" || appointmentStatus === "no_show") return "blocked";
  return "pending";
}

export function shouldPrefillAttendanceCart(paymentState: ReturnType<typeof attendancePaymentState>, serviceId: string, balances: { serviceId: string; remaining: number; expired: boolean }[]) {
  return paymentState === "pending" && !balances.some((balance) => balance.serviceId === serviceId && balance.remaining > 0 && !balance.expired);
}
