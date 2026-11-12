import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, auditLogs } from "@/db/schema";
import { directPixReservation } from "@/lib/booking-payment";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  if (body?.action !== "report_paid") return Response.json({ error: "Ação inválida." }, { status: 400 });
  const result = await db.transaction(async tx => {
    const [item] = await tx.select().from(appointments).where(eq(appointments.publicManageToken, token)).for("update");
    const pix = directPixReservation(item?.metadata);
    if (!item || !pix) return { error: "Reserva Pix não encontrada.", code: 404 };
    if (!["scheduled", "confirmed"].includes(item.status)) return { error: "Esta reserva não aceita mais pagamentos. Se já pagou, fale com a equipe.", code: 409 };
    if (item.depositStatus === "direct_review" || item.depositStatus === "paid") return { ok: true };
    if (item.depositStatus !== "direct_pending" || !item.reservationExpiresAt || item.reservationExpiresAt <= new Date()) return { error: "O prazo de pagamento terminou. Não pague este Pix; fale com a equipe se já realizou a transferência.", code: 409 };
    const now = new Date();
    await tx.update(appointments).set({ depositStatus: "direct_review", reservationExpiresAt: null, metadata: { ...item.metadata, directPix: { ...pix, reportedAt: now.toISOString() } }, updatedAt: now }).where(and(eq(appointments.id, item.id), eq(appointments.organizationId, item.organizationId)));
    await tx.insert(auditLogs).values({ organizationId: item.organizationId, action: "direct_pix_reported", entityType: "appointment", entityId: item.id, details: { source: "public_self_service", received: false } });
    return { ok: true };
  });
  return Response.json(result, { status: "error" in result ? result.code : 200, headers: { "Cache-Control": "no-store" } });
}
