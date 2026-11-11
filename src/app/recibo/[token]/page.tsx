import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { PrintReceiptButton } from "@/components/print-receipt-button";
import { db } from "@/db";
import { clients, organizations, retailSaleItems, retailSalePayments, retailSales } from "@/db/schema";
import { formatPhone } from "@/lib/phone";

const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const paymentLabels: Record<string, string> = { cash: "Espécie", card: "Cartões", pix: "PIX" };

export default async function RetailReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [sale] = await db.select({
    id: retailSales.id, soldAt: retailSales.soldAt, status: retailSales.status, subtotal: retailSales.subtotalInCents,
    discount: retailSales.discountInCents, total: retailSales.totalInCents, paymentMethod: retailSales.paymentMethod,
    clientName: clients.name, organizationName: organizations.name, legalName: organizations.legalName,
    taxId: organizations.taxId, address: organizations.publicAddress, phone: organizations.phone,
  }).from(retailSales).innerJoin(organizations, eq(organizations.id, retailSales.organizationId)).leftJoin(clients, eq(clients.id, retailSales.clientId)).where(eq(retailSales.receiptToken, token)).limit(1);
  if (!sale) notFound();
  if (["pending_payment", "payment_review"].includes(sale.status)) redirect(`/pagamento/venda/${token}`);
  const [items, payments] = await Promise.all([db.select().from(retailSaleItems).where(eq(retailSaleItems.saleId, sale.id)), db.select().from(retailSalePayments).where(eq(retailSalePayments.saleId, sale.id))]);

  const received = payments.filter(payment => payment.status === "received").reduce((sum,payment) => sum + payment.amountInCents - payment.refundedInCents,0);
  const outstanding = Math.max(0,sale.total - received);
  const onCredit = sale.status === "completed" && outstanding > 0;
  return <main className="mx-auto min-h-screen max-w-[80mm] bg-white p-4 font-mono text-[12px] text-black">
    <style>{`@page { size: 80mm auto; margin: 4mm; } @media print { body { background: white !important; } }`}</style>
    <div className="mb-4 flex justify-end"><PrintReceiptButton /></div>
    <header className="border-b border-dashed border-black pb-3 text-center"><h1 className="text-base font-black">{sale.organizationName}</h1>{sale.legalName && <p>{sale.legalName}</p>}{sale.taxId && <p>Documento: {sale.taxId}</p>}{sale.address && <p>{sale.address}</p>}{sale.phone && <p>{formatPhone(sale.phone)}</p>}</header>
    <section className="border-b border-dashed border-black py-3"><p><strong>{onCredit ? "COMPROVANTE DE VENDA A PRAZO" : "RECIBO NÃO FISCAL"}</strong></p>{sale.status !== "completed" && <p className="my-2 border border-black p-1 text-center font-black">VENDA {sale.status === "refunded" ? "ESTORNADA" : "CANCELADA"}</p>}<p>Venda: #{sale.id.slice(0, 8)}</p><p>Data: {sale.soldAt.toLocaleString("pt-BR")}</p><p>Cliente: {sale.clientName || "Não identificado"}</p></section>
    <section className="border-b border-dashed border-black py-3"><div className="grid grid-cols-[1fr_auto] gap-2 font-bold"><span>ITEM / QTD</span><span>TOTAL</span></div>{items.map((item) => <div className="grid grid-cols-[1fr_auto] gap-2 py-1" key={item.id}><span>{item.productName}{item.variantName !== "Padrão" ? ` - ${item.variantName}` : ""}<br />{item.quantity} x {currency(item.unitPriceInCents)}</span><span>{currency(item.totalInCents)}</span></div>)}</section>
    <section className="grid gap-1 border-b border-dashed border-black py-3"><p className="flex justify-between"><span>Subtotal</span><span>{currency(sale.subtotal)}</span></p>{sale.discount > 0 && <p className="flex justify-between"><span>Desconto</span><span>- {currency(sale.discount)}</span></p>}<p className="flex justify-between text-sm font-black"><span>TOTAL</span><span>{currency(sale.total)}</span></p>{payments.length ? payments.map((payment) => <div className="grid gap-1" key={payment.id}><p className="flex justify-between"><span>{payment.paymentMethodName || paymentLabels[payment.method] || payment.method}{(payment.cardInstallments ?? 0) > 1 && ` · ${payment.cardInstallments}×`}</span><span>{currency(payment.amountInCents)}</span></p>{(payment.buyerSurchargeInCents ?? 0) > 0 && <p className="flex justify-between"><span>Total no cartão com acréscimo</span><span>{currency(payment.amountInCents + (payment.buyerSurchargeInCents ?? 0))}</span></p>}</div>) : <p className="flex justify-between"><span>Pagamento</span><span>{paymentLabels[sale.paymentMethod ?? ""] ?? "Não informado"}</span></p>}</section>
    {onCredit && <section className="grid gap-1 border-b border-dashed border-black py-3"><p className="flex justify-between"><span>Recebido</span><span>{currency(received)}</span></p><p className="flex justify-between font-black"><span>Saldo a receber</span><span>{currency(outstanding)}</span></p><p>Este comprovante não representa quitação das parcelas pendentes.</p></section>}
    <footer className="pt-4 text-center"><p>Obrigado pela preferência!</p><p className="mt-2 text-[10px]">Documento sem valor fiscal.</p></footer>
  </main>;
}
