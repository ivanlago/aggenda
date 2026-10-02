import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, services, vouchers } from "@/db/schema";
import { portalRequestClient } from "@/lib/portal-request";
import { voucherCode, voucherError, voucherPrice } from "@/lib/voucher-rules";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const [organization] = await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true))).limit(1);
  if (!organization) return Response.json({ error: "Agenda indisponível." }, { status: 404 });
  const client = await portalRequestClient(request, organization.id);
  if (!client) return Response.json({ error: "Identifique-se antes de aplicar o voucher." }, { status: 401 });
  const code = voucherCode(String(body.code ?? ""));
  if (!/^[0-9a-f-]{36}$/i.test(String(body.serviceId ?? ""))) return Response.json({ error: "Selecione um procedimento válido." }, { status: 400 });
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return Response.json({ error: "Informe um código válido." }, { status: 400 });
  const [[service], [voucher]] = await Promise.all([
    db.select({ price: services.priceInCents }).from(services).where(and(eq(services.id, String(body.serviceId ?? "")), eq(services.organizationId, organization.id), eq(services.isActive, true))).limit(1),
    db.select().from(vouchers).where(and(eq(vouchers.organizationId, organization.id), eq(vouchers.code, code))).limit(1),
  ]);
  if (!service) return Response.json({ error: "Selecione um procedimento válido." }, { status: 400 });
  const error = voucherError(voucher, client.id);
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json({ code, ...voucherPrice(service.price, voucher) }, { headers: { "Cache-Control": "no-store" } });
}
