import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { vouchers } from "@/db/schema";
import { voucherError, voucherPrice } from "@/lib/voucher-rules";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function reserveBookingVoucher(tx: Transaction, organizationId: string, clientId: string, code: string, price: number | null) {
  const [voucher] = code ? await tx.select().from(vouchers).where(and(eq(vouchers.organizationId, organizationId), eq(vouchers.code, code))).limit(1).for("update") : [];
  if (code && voucherError(voucher, clientId)) throw new Error("VOUCHER_INVALID");
  return { voucher, ...voucherPrice(price, voucher) };
}
