import { redirect } from "next/navigation";
import { financeQuery, launchesUrl } from "@/lib/finance-navigation";

export default async function LegacyFinancePage({ searchParams }: { searchParams: Promise<Parameters<typeof financeQuery>[0]> }) {
  const query = financeQuery(await searchParams);
  if (query.get("cadastros") === "contas") redirect("/financeiro/cadastros");
  const tab = query.get("novo") === "payable" || query.get("tipo") === "payable" ? "pagar" : query.get("aba");
  query.delete("tipo");
  query.delete("cadastros");
  if (tab) query.set("aba", tab);
  redirect(launchesUrl(query));
}
