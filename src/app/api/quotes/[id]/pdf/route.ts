import { requireRetailQuote } from "@/lib/retail-quotes";
import { buildRetailQuotePdf } from "@/lib/retail-quote-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { quote, organization } = await requireRetailQuote((await params).id);
  const bytes = await buildRetailQuotePdf({ ...quote, organizationName: organization.name, createdDate: quote.createdAt.toLocaleDateString("pt-BR", { timeZone: organization.timezone }) });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="orcamento-${quote.id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" } });
}
