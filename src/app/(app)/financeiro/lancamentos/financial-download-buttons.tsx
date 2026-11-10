import { Download, FileSpreadsheet } from "lucide-react";

export function FinancialDownloadButtons({ filters }: { filters: Record<string, string | undefined> }) {
  const search = new URLSearchParams();
  for (const key of ["aba", "mes", "conta", "categoria", "status", "dia", "lancamento", "visao", "busca", "meio", "inicio", "fim", "cobranca"]) {
    if (filters[key]) search.set(key, filters[key]);
  }
  const href = (format: string) => "/api/finance/launches?" + new URLSearchParams([...search, ["formato", format]]);
  return <div className="flex flex-wrap gap-2">
    <a className="secondary-button" href={href("pdf")}><Download className="mr-2 size-4" />Baixar PDF</a>
    <a className="secondary-button" href={href("xlsx")}><FileSpreadsheet className="mr-2 size-4" />Baixar Excel</a>
  </div>;
}
