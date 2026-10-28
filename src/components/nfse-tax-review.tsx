import type { FiscalDraft } from "@/lib/nfse/xml";
import { fiscalRegimeLabels, percent, fiscalMoney, taxInCents } from "@/lib/nfse/tax-regimes";

export function NfseTaxReview({ draft }: { draft: FiscalDraft }) {
  const tax = draft.tax;
  return <details className="mt-3 rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-bold">Revisar tributação e endereço salvos</summary>
    <div className="mt-3 grid gap-2">
      <p>{tax ? fiscalRegimeLabels[tax.regime] : "Rascunho anterior do Simples Nacional"} · operação local tributável, sem retenções.</p>
      {tax?.regime === "mei" && <p>MEI: sem totalização percentual do Simples e sem PIS/COFINS no documento.</p>}
      {tax?.regime === "simples_nacional" && <p>Apuração SN 1 · total aproximado {percent(tax.simpleRateBasisPoints)}%.</p>}
      {tax && "pisCofins" in tax && <>
        <p>PIS/COFINS: CST {tax.pisCofins.cst}, sem retenção.</p>
        {"baseInCents" in tax.pisCofins && <p>Base R$ {fiscalMoney(tax.pisCofins.baseInCents)} · PIS {percent(tax.pisCofins.pisRateBasisPoints)}% (R$ {fiscalMoney(taxInCents(tax.pisCofins.baseInCents, tax.pisCofins.pisRateBasisPoints))}) · COFINS {percent(tax.pisCofins.cofinsRateBasisPoints)}% (R$ {fiscalMoney(taxInCents(tax.pisCofins.baseInCents, tax.pisCofins.cofinsRateBasisPoints))}).</p>}
        <p>Tributos aproximados: federal {percent(tax.approximate.federalBasisPoints)}%, estadual {percent(tax.approximate.stateBasisPoints)}%, municipal {percent(tax.approximate.municipalBasisPoints)}%.</p>
      </>}
      {draft.ibsCbs && <p>IBS/CBS: CST {draft.ibsCbs.cst} · classificação {draft.ibsCbs.classification} · operação {draft.ibsCbs.operationIndicator} · uso pessoal {draft.ibsCbs.finalConsumer === "1" ? "sim" : "não"} · destinatário igual ao pagador.</p>}
      {draft.address && <p>Endereço: {draft.address.street}, {draft.address.number} · {draft.address.district} · IBGE {draft.address.municipalityCode} · CEP {draft.address.zip}.</p>}
      {!tax && <p>Total aproximado legado: {draft.totalTaxPercent}%.</p>}
    </div>
  </details>;
}
