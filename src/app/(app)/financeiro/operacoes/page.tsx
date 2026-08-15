import { redirect } from "next/navigation";

export default async function LegacyFinancialOperationsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const query = await searchParams;
  redirect(query.mes ? `/financeiro/comissoes?mes=${query.mes}` : "/financeiro/comissoes");
}
