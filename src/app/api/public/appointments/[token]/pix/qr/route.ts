import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { directPixReservation } from "@/lib/booking-payment";

export const runtime = "nodejs";

// The unguessable reservation token grants the same access as its payment page.
export async function GET(_request: Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token)) return new Response(null,{status:404});
  const [item]=await db.select({metadata:appointments.metadata,status:appointments.status,depositStatus:appointments.depositStatus,expiresAt:appointments.reservationExpiresAt}).from(appointments).where(eq(appointments.publicManageToken,token)).limit(1);
  const pix=directPixReservation(item?.metadata);
  const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer"};
  if (!item || !pix) return new Response(null,{status:404,headers});
  if (!["scheduled","confirmed"].includes(item.status) || item.depositStatus!=="direct_pending" || !item.expiresAt || item.expiresAt<=new Date()) return new Response(null,{status:410,headers});
  const png=await QRCode.toBuffer(pix.payload,{type:"png",width:480,margin:4,errorCorrectionLevel:"M"});
  return new Response(new Uint8Array(png),{headers:{...headers,"Content-Type":"image/png","Content-Disposition":"inline; filename=pix-sinal.png"}});
}
