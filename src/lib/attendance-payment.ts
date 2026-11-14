export function attendancePaymentState({ paymentStatus, packageStatus, appointmentStatus }: { paymentStatus?: string | null; packageStatus?: string | null; appointmentStatus: string }) {
  if (paymentStatus === "received") return "paid";
  if (packageStatus === "reserved" || packageStatus === "consumed") return "package";
  if (appointmentStatus === "cancelled" || appointmentStatus === "no_show") return "blocked";
  return "pending";
}

export function shouldPrefillAttendanceCart(paymentState: ReturnType<typeof attendancePaymentState>, serviceId: string, balances: { serviceId: string; remaining: number; expired: boolean }[]) {
  return paymentState === "pending" && !balances.some((balance) => balance.serviceId === serviceId && balance.remaining > 0 && !balance.expired);
}

export function attendanceCheckoutSummary(input: {
  paymentStatus?: string | null; packageStatus?: string | null; appointmentStatus: string;
  serviceAmount: number; entryAmount?: number | null; depositAmount: number; depositStatus: string; managedCharge: boolean;
}): { state: ReturnType<typeof attendancePaymentState>; balance: number; awaitingDeposit: boolean; canReceiveService: boolean } {
  const awaitingDeposit = input.depositAmount > 0 && ["pending", "direct_pending", "direct_review"].includes(input.depositStatus);
  const fullyPaidDeposit = input.depositStatus === "paid" && input.depositAmount > 0 && input.depositAmount >= input.serviceAmount;
  const state: ReturnType<typeof attendancePaymentState> = fullyPaidDeposit ? "paid" : attendancePaymentState(input);
  const balance = state === "paid" || state === "package" ? 0 : input.entryAmount ?? Math.max(0, input.serviceAmount - input.depositAmount);
  return { state, balance, awaitingDeposit, canReceiveService: state === "pending" && balance > 0 && !awaitingDeposit && !input.managedCharge };
}
