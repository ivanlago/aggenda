import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appointments } from "@/db/schema";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";
import { syncAppointmentFinancialEntry } from "@/lib/finance";
import { deleteAppointmentFromGoogleCalendar } from "@/lib/google-calendar";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const body = await request.json() as { action?: string };
  if (!['confirm', 'cancel'].includes(body.action ?? "")) return Response.json({ error: "Ação inválida." }, { status: 400 });
  const [item] = await db.select().from(appointments).where(eq(appointments.publicManageToken, token)).limit(1);
  if (!item) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
  if (["cancelled", "completed", "no_show"].includes(item.status)) return Response.json({ error: "Este agendamento não aceita mais alterações." }, { status: 409 });
  const status = body.action === "confirm" ? "confirmed" : "cancelled";
  await db.update(appointments).set({ status, confirmedAt: status === "confirmed" ? new Date() : item.confirmedAt, cancellationReason: status === "cancelled" ? "Cancelado pelo paciente" : null, updatedAt: new Date() }).where(eq(appointments.id, item.id));
  await syncAppointmentFinancialEntry(item.id);
  if (status === "cancelled") await deleteAppointmentFromGoogleCalendar(item.id);
  await enqueueAppointmentNotification(item.id, status === "confirmed" ? "confirmation" : "cancellation");
  return Response.json({ status });
}
