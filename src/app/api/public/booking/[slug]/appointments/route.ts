import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { portalRequestClient } from "@/lib/portal-request";
import { createBookingReservation } from "@/lib/create-booking-reservation";

export async function POST(request: Request, {params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  const body = await request.clone().json().catch(() => null);
  const [organization] = await db.select({id: organizations.id}).from(organizations).where(and(eq(organizations.slug,slug),eq(organizations.bookingEnabled,true))).limit(1);
  if (!organization) return Response.json({error:"Agenda indisponível."},{status:404});
  const client = await portalRequestClient(request, organization.id, typeof body?.patientId === "string" ? body.patientId : undefined);
  if (!client) return Response.json({error:"Identifique-se na área do cliente antes de agendar."},{status:401});
  return createBookingReservation(request,slug,client);
}
