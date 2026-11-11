import { organizationDate } from "@/lib/organization-time";
import { ActionForm } from "@/components/action-form";
import { issueSaleBoleto } from "@/actions/pos-boleto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { organizations, paymentCharges, retailSales } from "@/db/schema";
import { checkoutUrlIsSafe } from "@/lib/pos-payments-policy";
import { retailSaleStatusLabels } from "@/lib/retail-sale-status";
import { posProviderNames } from "@/lib/pos-providers";
import { CopyButton } from "@/components/copy-button";
import { PaymentStatusRefresh } from "@/components/payment-status-refresh";

export const metadata = { title: "Pagamento", robots: { index: false, follow: false } };
export default async function PublicSalePayment({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(token)) notFound();
  const rows = await db.select({ id: paymentCharges.id, dueDate:paymentCharges.dueDate, timezone:organizations.timezone, amount: paymentCharges.amountInCents, chargeStatus: paymentCharges.status, company: organizations.name, status: retailSales.status, total: retailSales.totalInCents,
    pix: paymentCharges.pixQrCodePayload, provider: paymentCharges.provider, url: paymentCharges.invoiceUrl, environment: paymentCharges.metadata }).from(retailSales)
    .innerJoin(organizations, eq(organizations.id, retailSales.organizationId)).innerJoin(paymentCharges, and(eq(paymentCharges.organizationId, retailSales.organizationId), eq(paymentCharges.originId, sql`${retailSales.id}::text`), eq(paymentCharges.originType, "retail_sale"), inArray(paymentCharges.provider, ["mercado_pago", "asaas", "pagbank", "efi"])))
    .where(eq(retailSales.receiptToken, token)).orderBy(paymentCharges.dueDate, paymentCharges.createdAt, paymentCharges.id);
  const row = rows[0];
  if (!row) notFound();
  const creditSale = rows.every(part => part.environment?.saleOnCredit === true);
  const allPaid = rows.every(part => part.chargeStatus === "paid");
  const awaiting = row.status === "pending_payment" || (row.status === "completed" && creditSale && !allPaid);
  const today = organizationDate(new Date(),row.timezone);
  const creationFailed = rows.some(part => part.chargeStatus === "pending" && part.environment?.checkoutState === "rejected");
  return <main className="mx-auto grid min-h-screen max-w-xl content-center gap-5 px-5 py-10"><section className="panel form-stack"><h1 className="text-2xl font-extrabold">{row.company}</h1><h2 className="text-lg font-bold">Pagamento da compra</h2><p className="text-3xl font-extrabold text-brand">{(row.total/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p><p role="status">{awaiting && creationFailed ? "Cobrança indisponível. Entre em contato com o estabelecimento." : awaiting && creditSale ? "Venda concluída · saldo a receber" : retailSaleStatusLabels[row.status] ?? "Em conferência"}</p>
    {row.status === "completed" && allPaid && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" role="status"><p className="text-lg font-extrabold">Pagamento confirmado</p><p className="mt-1 text-sm">Sua compra foi concluída. O recibo está disponível abaixo.</p></div>}<PaymentStatusRefresh pending={awaiting && !creationFailed && (!creditSale || rows.some(part => part.chargeStatus === "pending" && Boolean(part.url)))} />{row.environment?.environment === "sandbox" && <p className="font-bold text-amber-800">Ambiente de testes. Sem recebimento real.</p>}
    {awaiting && rows.map(part => <div key={part.id} className="grid gap-3 rounded-xl border p-4">
      <p className="font-bold">{String(part.environment?.catalogPaymentMethodName ?? "Pagamento")}{Number(part.environment?.installmentCount) > 1 && ` · Parcela ${part.environment?.installmentNumber}/${part.environment?.installmentCount}`} · {(part.amount/100).toLocaleString("pt-BR", {style:"currency",currency:"BRL"})} · {part.chargeStatus === "paid" ? "Confirmado" : part.chargeStatus === "cancelled" ? "Cancelado" : part.environment?.checkoutState === "rejected" ? "Cobrança indisponível" : "Aguardando pagamento"}</p>
      {creditSale && <p className="text-sm">Vencimento: {part.dueDate.split("-").reverse().join("/")}</p>}
      {creditSale && part.chargeStatus === "pending" && !part.url && part.environment?.checkoutState === "new" && (String(part.environment?.boletoAvailableFrom ?? "") > today ? <p className="text-sm text-muted">Boleto disponível a partir de {String(part.environment?.boletoAvailableFrom).split("-").reverse().join("/")}.</p> : part.dueDate <= today ? <p className="text-sm">Contate o estabelecimento para regularizar esta parcela.</p> : <ActionForm action={issueSaleBoleto} successMessage="Emissão consultada."><input type="hidden" name="token" value={token}/><input type="hidden" name="chargeId" value={part.id}/><button className="primary-button">Gerar boleto da parcela</button></ActionForm>)}
      {part.chargeStatus === "pending" && part.url && checkoutUrlIsSafe(part.url, part.provider) && <a className="primary-button" href={part.url} rel="noreferrer">Pagar com {posProviderNames[part.provider]}</a>}
      {part.chargeStatus === "pending" && part.provider === "efi" && part.pix && <CopyButton value={part.pix} label="Copiar código Pix" />}
    </div>)}
    {row.status === "completed" ? <Link className="primary-button" href={`/recibo/${token}`}>{creditSale && !allPaid ? "Comprovante de venda a prazo" : "Baixar recibo não fiscal"}</Link> : <p className="text-sm text-muted">O recebimento é confirmado diretamente pelo provedor de pagamento. Em caso de dúvida, entre em contato com o estabelecimento.</p>}
  </section></main>;
}
