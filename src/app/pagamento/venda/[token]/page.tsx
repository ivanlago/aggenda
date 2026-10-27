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
  const [row] = await db.select({ company: organizations.name, status: retailSales.status, total: retailSales.totalInCents,
    pix: paymentCharges.pixQrCodePayload, provider: paymentCharges.provider, url: paymentCharges.invoiceUrl, environment: paymentCharges.metadata }).from(retailSales)
    .innerJoin(organizations, eq(organizations.id, retailSales.organizationId)).innerJoin(paymentCharges, and(eq(paymentCharges.organizationId, retailSales.organizationId), eq(paymentCharges.originId, sql`${retailSales.id}::text`), eq(paymentCharges.originType, "retail_sale"), inArray(paymentCharges.provider, ["mercado_pago", "asaas", "pagbank", "efi"])))
    .where(eq(retailSales.receiptToken, token)).limit(1);
  if (!row) notFound();
  return <main className="mx-auto grid min-h-screen max-w-xl content-center gap-5 px-5 py-10"><section className="panel form-stack"><h1 className="text-2xl font-extrabold">{row.company}</h1><h2 className="text-lg font-bold">Pagamento da compra</h2><p className="text-3xl font-extrabold text-brand">{(row.total/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p><p role="status">{retailSaleStatusLabels[row.status] ?? "Em conferência"}</p>
    <PaymentStatusRefresh pending={row.status === "pending_payment"} />{row.environment?.environment === "sandbox" && <p className="font-bold text-amber-800">Ambiente de testes. Sem recebimento real.</p>}
    {row.status === "pending_payment" && row.url && checkoutUrlIsSafe(row.url, row.provider) && <a className="primary-button" href={row.url} rel="noreferrer">Pagar com {posProviderNames[row.provider]}</a>}
    {row.status === "pending_payment" && row.provider === "efi" && row.pix && <div className="grid gap-3"><p className="text-sm">Copie o código Pix e pague pelo aplicativo do seu banco.</p><CopyButton value={row.pix} label="Copiar código Pix" /></div>}
    {row.status === "completed" ? <Link className="primary-button" href={`/recibo/${token}`}>Baixar recibo não fiscal</Link> : <p className="text-sm text-muted">O recebimento é confirmado diretamente pelo provedor de pagamento. Em caso de dúvida, entre em contato com o estabelecimento.</p>}
  </section></main>;
}
