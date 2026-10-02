import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { voucherDeliveries } from "@/db/schema";
import { processVoucherDeliveries } from "@/lib/voucher-delivery";

function signature(organizationId: string, expires: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Segredo da aplicação não configurado.");
  return createHmac("sha256", secret).update(`voucher-drain:${organizationId}:${expires}`).digest("hex");
}

export function validVoucherDrain(organizationId: string, expires: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || !/^\d{13}$/.test(expires) || Number(expires) < Date.now() || Number(expires) > Date.now() + 120_000 || !/^[0-9a-f]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(signature(organizationId, expires)), Buffer.from(token));
}

/** Continue long campaigns in another bounded server execution, without browser polling. */
export async function drainVoucherCampaign(organizationId: string) {
  const result = await processVoucherDeliveries(organizationId);
  const [pending] = await db.select({ id: voucherDeliveries.id }).from(voucherDeliveries).where(and(eq(voucherDeliveries.organizationId, organizationId), eq(voucherDeliveries.status, "pending"))).limit(1);
  if (pending) {
    const expires = String(Date.now() + 60_000);
    try {
      const response = await fetch(`${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/internal/voucher-deliveries`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-voucher-drain": signature(organizationId, expires) },
        body: JSON.stringify({ organizationId, expires }), signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) console.warn("[voucher] A fila aguarda nova execução", response.status);
    } catch { console.warn("[voucher] A fila será retomada ao processar os envios pendentes."); }
  }
  return result;
}
