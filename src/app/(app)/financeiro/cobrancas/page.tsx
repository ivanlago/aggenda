import { redirect } from "next/navigation";
import { financeQuery, launchesUrl } from "@/lib/finance-navigation";

export default async function LegacyChargesPage({ searchParams }: { searchParams: Promise<Parameters<typeof financeQuery>[0]> }) {
  const query = financeQuery(await searchParams);
  query.set("aba", "receber");
  query.set("visao", "cobrancas");
  redirect(launchesUrl(query));
}
