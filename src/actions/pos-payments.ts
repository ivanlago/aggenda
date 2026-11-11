"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { retailSales } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission, assertOrganizationPermission } from "@/lib/permissions";
import { cancelPosCheckout, refreshPosPayment, ensurePosCheckout } from "@/lib/pos-checkout";

async function contextForSale(data: FormData) {
  const context = await requireOrganization();
  if (!hasOrganizationPermission(context.organization.role, "sales.sell") && !hasOrganizationPermission(context.organization.role, "inventory.manage")) assertOrganizationPermission(context.organization.role, "finance.manage");
  const saleId = String(data.get("saleId") ?? "");
  if (!/^[a-f0-9-]{36}$/i.test(saleId)) throw new Error("Venda inválida.");
  const [sale] = await db.select({ id: retailSales.id }).from(retailSales).where(and(eq(retailSales.id, saleId), eq(retailSales.organizationId, context.organization.id))).limit(1);
  if (!sale) throw new Error("Venda não encontrada.");
  return { ...context, saleId };
}
function refresh(saleId: string) {
  revalidatePath(`/vendas/pagamento/${saleId}`); revalidatePath("/vendas"); revalidatePath("/estoque"); revalidatePath("/financeiro/lancamentos"); revalidatePath("/pacotes");
}
export async function consultPosPayment(data: FormData) {
  const { organization, saleId } = await contextForSale(data);
  try { await ensurePosCheckout(organization.id,saleId); await refreshPosPayment(organization.id, saleId); }
  catch { return { error: "Não foi possível consultar o provedor de pagamento. A venda não foi marcada como paga. Confira a conexão e tente novamente." }; }
  refresh(saleId);
}
export async function cancelPendingPosPayment(data: FormData) {
  const { organization, session, saleId } = await contextForSale(data);
  assertOrganizationPermission(organization.role, "sales.cancel");
  try { await cancelPosCheckout(organization.id, saleId, session.user.id); }
  catch (error) {
    refresh(saleId);
    const message = error instanceof Error ? error.message : "";
    const safe = ["Há pagamento processado nesta venda.", "A criação do checkout está inconclusiva.", "O provedor de pagamento já processou", "O provedor de pagamento ainda não confirmou", "O Mercado Pago já processou", "O Mercado Pago ainda não confirmou", "Confira o pagamento;"];
    return { error: safe.some(prefix => message.startsWith(prefix)) ? message : "Não foi possível confirmar o cancelamento no provedor de pagamento. A reserva foi mantida; consulte a situação antes de tentar novamente." };
  }
  refresh(saleId);
}
