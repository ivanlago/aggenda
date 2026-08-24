import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { PrintReceiptButton } from "@/components/print-receipt-button";
import { db } from "@/db";
import { clients, organizations, retailSaleItems, retailSales } from "@/db/schema";

const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const paymentLabels: Record<string, string> = { cash: "Espécie", card: "Cartões", pix: "PIX" };

export default async function RetailReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [sale] = await db.select({
    id: retailSales.id, soldAt: retailSales.soldAt, subtotal: retailSales.subtotalInCents,
    discount: retailSales.discountInCents, total: retailSales.totalInCents, paymentMethod: retailSales.paymentMethod,
    clientName: clients.name, organizationName: organizations.name, legalName: organizations.legalName,
    taxId: organizations.taxId, address: organizations.publicAddress, phone: organizations.phone,
  }).from(retailSales).innerJoin(organizations, eq(organizations.id, retailSales.organizationId)).leftJoin(clients, eq(clients.id, retailSales.clientId)).where(eq(retailSales.receiptToken, token)).limit(1);
  if (!sale) notFound();
  const items = await db.select().from(retailSaleItems).where(eq(retailSaleItems.saleId, sale.id));

  return <main className="mx-auto min-h-screen max-w-[80mm] bg-white p-4 font-mono text-[12px] text-black">
    <style>{`@page { size: 80mm auto; margin: 4mm; } @media print { body { background: white !important; } }`}</style>
    <div className="mb-4 flex justify-end"><PrintReceiptButton /></div>
    <header className="border-b border-dashed border-black pb-3 text-center"><h1 className="text-base font-black">{sale.organizationName}</h1>{sale.legalName && <p>{sale.legalName}</p>}{sale.taxId && <p>Documento: {sale.taxId}</p>}{sale.address && <p>{sale.address}</p>}{sale.phone && <p>{sale.phone}</p>}</header>
    <section className="border-b border-dashed border-black py-3"><p><strong>RECIBO NÃO FISCAL</strong></p><p>Venda: #{sale.id.slice(0, 8)}</p><p>Data: {sale.soldAt.toLocaleString("pt-BR")}</p><p>Cliente: {sale.clientName || "Não identificado"}</p></section>
    <section className="border-b border-dashed border-black py-3"><div className="grid grid-cols-[1fr_auto] gap-2 font-bold"><span>ITEM / QTD</span><span>TOTAL</span></div>{items.map((item) => <div className="grid grid-cols-[1fr_auto] gap-2 py-1" key={item.id}><span>{item.productName}{item.variantName !== "Padrão" ? ` - ${item.variantName}` : ""}<br />{item.quantity} x {currency(item.unitPriceInCents)}</span><span>{currency(item.totalInCents)}</span></div>)}</section>
    <section className="grid gap-1 border-b border-dashed border-black py-3"><p className="flex justify-between"><span>Subtotal</span><span>{currency(sale.subtotal)}</span></p>{sale.discount > 0 && <p className="flex justify-between"><span>Desconto</span><span>- {currency(sale.discount)}</span></p>}<p className="flex justify-between text-sm font-black"><span>TOTAL</span><span>{currency(sale.total)}</span></p><p className="flex justify-between"><span>Pagamento</span><span>{paymentLabels[sale.paymentMethod ?? ""] ?? "Não informado"}</span></p></section>
    <footer className="pt-4 text-center"><p>Obrigado pela preferência!</p><p className="mt-2 text-[10px]">Documento sem valor fiscal.</p></footer>
  </main>;
}
