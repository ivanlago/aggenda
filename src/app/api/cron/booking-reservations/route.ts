import { timingSafeEqual } from "node:crypto";
import { expireBookingReservations } from "@/lib/booking-reservation-expiry";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accepted = [process.env.CRON_SECRET, process.env.AGGENDA_INTERNAL_API_KEY].some(secret=>{if(!secret)return false;const actual=Buffer.from(authorization),expected=Buffer.from(`Bearer ${secret}`);return actual.length===expected.length && timingSafeEqual(actual,expected);});
  if (!accepted) return Response.json({error:"Unauthorized"},{status:401});
  return Response.json({ok:true,expired:await expireBookingReservations()});
}
