import { fiscalRegimeLabels, type FiscalRegime } from "@/lib/nfse/tax-regimes";

export function NfseTaxFields({ regime }: { regime: FiscalRegime }) {
  const regular = regime === "lucro_presumido" || regime === "lucro_real";
  return <fieldset className="grid gap-3 rounded-xl border p-4 md:col-span-2 md:grid-cols-2">
    <legend className="px-1 font-bold">Tributação — {fiscalRegimeLabels[regime]}</legend>
    <p className="text-sm text-muted md:col-span-2">Serviço tributável prestado no município do emitente, sem retenções, descontos, deduções, benefícios, regime especial ou destinatário diferente do pagador. Valores e códigos devem ser conferidos com o contador. As alíquotas não são presumidas pelo regime.</p>
    {regime === "mei" && <p className="text-sm md:col-span-2">MEI: sem alíquota percentual do Simples e sem grupo federal de PIS/COFINS neste cenário. O XML utiliza o indicador próprio do MEI e não envia inscrição municipal.</p>}
    {regime === "simples_nacional" && <>
      <input type="hidden" name="snAssessment" value="1" />
      <p className="text-sm md:col-span-2">Apuração federal e ISS pelo Simples (regime de apuração 1). Sublimites excedidos e apuração fora do Simples ainda não estão contemplados.</p>
      <label className="grid gap-2 text-sm font-bold">Total aproximado de tributos do Simples (%)<input className="field" name="simpleRate" inputMode="decimal" required /></label>
    </>}
    {regular && <>
      <label className="grid gap-2 text-sm font-bold">CST do PIS/COFINS<select className="field" name="pisCofinsCst" defaultValue="" required><option value="">Selecione com o contador</option><option value="01">01 — Alíquota básica</option><option value="02">02 — Alíquota diferenciada</option><option value="06">06 — Alíquota zero</option><option value="07">07 — Isenta</option><option value="08">08 — Sem incidência</option><option value="09">09 — Suspensão</option></select></label>
      <p className="text-sm text-muted">Para CST 01/02, preencha base e as duas alíquotas. Para 06/07/08/09, deixe esses três campos em branco. Estes valores representam apuração própria, sem retenção.</p>
      <label className="grid gap-2 text-sm font-bold">Base de PIS/COFINS (R$)<input className="field" name="pisCofinsBase" inputMode="decimal" placeholder="Sem separador de milhar" /></label>
      <label className="grid gap-2 text-sm font-bold">PIS (%)<input className="field" name="pisRate" inputMode="decimal" /></label>
      <label className="grid gap-2 text-sm font-bold">COFINS (%)<input className="field" name="cofinsRate" inputMode="decimal" /></label>
      <p className="text-sm text-muted">O ISS desta operação local será obtido da parametrização municipal pelo Emissor Nacional. Não enviaremos uma alíquota municipal estimada.</p>
      <label className="grid gap-2 text-sm font-bold">Tributos aproximados federais (%)<input className="field" name="approximateFederal" inputMode="decimal" required /></label>
      <label className="grid gap-2 text-sm font-bold">Tributos aproximados estaduais (%)<input className="field" name="approximateState" inputMode="decimal" required /></label>
      <label className="grid gap-2 text-sm font-bold">Tributos aproximados municipais (%)<input className="field" name="approximateMunicipal" inputMode="decimal" required /></label>
    </>}
    <fieldset className="grid gap-3 rounded-lg border p-3 md:col-span-2 md:grid-cols-2"><legend className="px-1 text-sm font-bold">IBS/CBS — operação regular, CST 000 ou 200</legend>
      <p className="text-xs text-muted md:col-span-2">{regular ? "Obrigatório neste piloto para não optantes com competência em 2026." : "Preencha somente quando aplicável; nesse caso, informe todos os campos e o NBS."} Não contempla diferimento, crédito presumido ou grupos de operações especiais.</p>
      <label className="grid gap-2 text-sm font-bold">CST IBS/CBS<select className="field" name="ibsCst" defaultValue="" required={regular}><option value="">Não informado</option><option value="000">000 — Tributação integral</option><option value="200">200 — Alíquota reduzida</option></select></label>
      <label className="grid gap-2 text-sm font-bold">Classificação tributária<input className="field" name="ibsClassification" pattern="[0-9]{6}" maxLength={6} required={regular} /></label>
      <label className="grid gap-2 text-sm font-bold">Indicador da operação<input className="field" name="ibsOperation" pattern="[0-9]{6}" maxLength={6} required={regular} /></label>
      <label className="grid gap-2 text-sm font-bold">Uso ou consumo pessoal<select className="field" name="ibsFinalConsumer" defaultValue="" required={regular}><option value="">Selecione quando informar IBS/CBS</option><option value="0">Não</option><option value="1">Sim</option></select></label>
    </fieldset>
  </fieldset>;
}
