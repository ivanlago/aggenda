import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { retailSales } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission, hasOrganizationPermission } from "@/lib/permissions";
import { getPosCharge } from "@/lib/pos-checkout";
import { checkoutUrlIsSafe } from "@/lib/pos-payments-policy";
import { retailSaleStatusLabels } from "@/lib/retail-sale-status";
import { posProviderNames } from "@/lib/pos-providers";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PaymentStatusRefresh } from "@/components/payment-status-refresh";
import { consultPosPayment, cancelPendingPosPayment } from "@/actions/pos-payments";

export const metadata = { title: "Pagamento da venda" };
const money = (amount: number) => (amount/100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default async function PosPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "sales.sell") && !hasOrganizationPermission(organization.role, "inventory.read")) assertOrganizationPermission(organization.role, "finance.read");
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const [sale] = await db.select().from(retailSales).where(and(eq(retailSales.id, id), eq(retailSales.organizationId, organization.id))).limit(1);
  if (!sale || !sale.paymentProvider) notFound();
  const charge = await getPosCharge(organization.id, id);
  const summary = charge.metadata?.summary as { feeInCents?: number | null; netInCents?: number | null; refundedInCents?: number } | undefined;
  const paymentUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "")}/pagamento/venda/${sale.receiptToken}`;
  return <div className="page-wrap"><Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/vendas">← Voltar ao PDV</Link>
    <PageHeader eyebrow={posProviderNames[charge.provider]} title={`Venda #${sale.id.slice(0,8)}`} description="Acompanhe a cobrança vinculada à venda. Gerar ou abrir o checkout não confirma o recebimento." />
    <PaymentStatusRefresh pending={sale.status === "pending_payment"} />
    <section className="panel form-stack"><p className="status-pill w-fit" role="status">{retailSaleStatusLabels[sale.status] ?? sale.status}</p><p className="text-3xl font-extrabold text-brand">{money(sale.totalInCents)}</p>
      {charge.metadata?.environment === "sandbox" && <p className="font-bold text-amber-800">Ambiente de testes: este checkout não representa um recebimento real.</p>}
      {sale.status === "pending_payment" && <><p className="text-sm text-muted">Produtos reservados. Pacotes e recebimento financeiro serão liberados somente após a confirmação. A reserva permanece até o pagamento ou cancelamento confirmado.</p>
        {charge.invoiceUrl && checkoutUrlIsSafe(charge.invoiceUrl, charge.provider) ? <div className="flex flex-wrap gap-3"><a className="primary-button" href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer">Abrir checkout {posProviderNames[charge.provider]}</a><CopyButton value={paymentUrl} label="Copiar link para o cliente" /></div> : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{String(charge.metadata?.checkoutError ?? "Aguardando criação do checkout. Atualize esta página em alguns instantes.")}</p>}</>}
      {charge.metadata?.attention ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{String(charge.metadata.attention)}</p> : null}
      <div className="flex flex-wrap gap-3"><ActionForm action={consultPosPayment} successMessage="Situação consultada no provedor de pagamento."><input type="hidden" name="saleId" value={id} /><button className="secondary-button">Consultar situação no provedor de pagamento</button></ActionForm>
        {sale.status === "pending_payment" && hasOrganizationPermission(organization.role, "sales.cancel") && <ActionForm action={cancelPendingPosPayment} successMessage="Cancelamento confirmado e reserva liberada."><input type="hidden" name="saleId" value={id} /><ConfirmSubmitButton className="secondary-button text-red-700" message="Cancelar este checkout? A reserva só será liberada após conferir e cancelar os pagamentos pendentes no provedor de pagamento.">Cancelar checkout e liberar reserva</ConfirmSubmitButton></ActionForm>}
        {sale.status === "completed" && <Link className="primary-button" href={`/recibo/${sale.receiptToken}`} target="_blank">Abrir recibo não fiscal</Link>}</div>
      {summary && <div className="rounded-xl border p-4 text-sm"><p>Valor bruto: {money(sale.totalInCents)}</p><p>Tarifas informadas: {typeof summary.feeInCents === "number" ? money(summary.feeInCents) : "Aguardando informação do provedor"}</p><p>Líquido informado: {typeof summary.netInCents === "number" ? money(summary.netInCents) : "Aguardando informação do provedor"}</p>{Boolean(summary.refundedInCents) && <p>Valor estornado: {money(summary.refundedInCents!)}</p>}<p className="mt-2 text-muted">Pagamento aprovado e saldo disponível para saque têm prazos distintos. Confira a liberação na sua conta provedor de pagamento.</p></div>}
      {["refunded", "payment_review"].includes(sale.status) && <p className="text-sm text-muted">Estornos e contestações não devolvem produtos ao estoque automaticamente. Registre a entrada somente após conferir a devolução física. Pacotes desta venda ficam suspensos para conferência.</p>}
    </section></div>;
}
