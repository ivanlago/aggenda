import { z } from "zod";

export const fiscalRegimeSchema = z.enum(["mei", "simples_nacional", "lucro_presumido", "lucro_real"]);
export type FiscalRegime = z.infer<typeof fiscalRegimeSchema>;
export const fiscalRegimeLabels: Record<FiscalRegime, string> = { mei: "MEI", simples_nacional: "Simples Nacional — ME/EPP", lucro_presumido: "Lucro Presumido", lucro_real: "Lucro Real" };
const rate = z.number().int().min(0).max(9999);
const taxablePisCofins = z.object({ cst: z.enum(["01", "02"]), baseInCents: z.number().int().positive().max(2_000_000_000), pisRateBasisPoints: rate, cofinsRateBasisPoints: rate }).strict();
const untaxedPisCofins = z.object({ cst: z.enum(["06", "07", "08", "09"]) }).strict();
export const pisCofinsSchema = z.union([taxablePisCofins, untaxedPisCofins]);
const approximateRate = z.number().int().min(0).max(10000);
export const approximateTaxSchema = z.object({ federalBasisPoints: approximateRate, stateBasisPoints: approximateRate, municipalBasisPoints: approximateRate }).strict();
const scenario = z.literal("local_tributavel_sem_retencoes");
export const nationalTaxSchema = z.discriminatedUnion("regime", [
  z.object({ regime: z.literal("mei"), scenario }).strict(),
  z.object({ regime: z.literal("simples_nacional"), scenario, assessment: z.literal("1"), simpleRateBasisPoints: rate }).strict(),
  z.object({ regime: z.enum(["lucro_presumido", "lucro_real"]), scenario, pisCofins: pisCofinsSchema, approximate: approximateTaxSchema }).strict(),
]);
export type NationalTax = z.infer<typeof nationalTaxSchema>;
export const ibsCbsSchema = z.object({
  cst: z.enum(["000", "200"]), classification: z.string().regex(/^\d{6}$/), operationIndicator: z.string().regex(/^\d{6}$/), finalConsumer: z.enum(["0", "1"]),
}).strict().refine((value) => value.classification.startsWith(value.cst), "A classificação IBS/CBS deve corresponder ao CST informado.");

export function fiscalChannelFor(municipalityCode: string, regime: FiscalRegime) {
  return municipalityCode === "2927408" && (regime === "lucro_presumido" || regime === "lucro_real") ? "salvador" as const : "national" as const;
}
export const percent = (basisPoints: number) => (basisPoints / 100).toFixed(2);
export const fiscalMoney = (cents: number) => (cents / 100).toFixed(2);
export const taxInCents = (base: number, basisPoints: number) => Math.round(base * basisPoints / 10000);

export function nationalTaxXml(tax: NationalTax, amountInCents: number) {
  const data = nationalTaxSchema.parse(tax);
  const op = data.regime === "mei" ? "2" : data.regime === "simples_nacional" ? "3" : "1";
  const issuer = `<opSimpNac>${op}</opSimpNac>${data.regime === "simples_nacional" ? "<regApTribSN>1</regApTribSN>" : ""}<regEspTrib>0</regEspTrib>`;
  let federal = "";
  let total: string;
  if (data.regime === "mei") total = "<indTotTrib>0</indTotTrib>";
  else if (data.regime === "simples_nacional") total = `<pTotTribSN>${percent(data.simpleRateBasisPoints)}</pTotTribSN>`;
  else {
    const pis = data.pisCofins;
    if ("baseInCents" in pis && pis.baseInCents > amountInCents) throw new Error("A base de PIS/COFINS não pode superar o valor do serviço.");
    const taxable = "baseInCents" in pis ? `<vBCPisCofins>${fiscalMoney(pis.baseInCents)}</vBCPisCofins><pAliqPis>${percent(pis.pisRateBasisPoints)}</pAliqPis><pAliqCofins>${percent(pis.cofinsRateBasisPoints)}</pAliqCofins><vPis>${fiscalMoney(taxInCents(pis.baseInCents, pis.pisRateBasisPoints))}</vPis><vCofins>${fiscalMoney(taxInCents(pis.baseInCents, pis.cofinsRateBasisPoints))}</vCofins>` : "";
    federal = `<tribFed><piscofins><CST>${pis.cst}</CST>${taxable}<tpRetPisCofins>2</tpRetPisCofins></piscofins></tribFed>`;
    total = `<pTotTrib><pTotTribFed>${percent(data.approximate.federalBasisPoints)}</pTotTribFed><pTotTribEst>${percent(data.approximate.stateBasisPoints)}</pTotTribEst><pTotTribMun>${percent(data.approximate.municipalBasisPoints)}</pTotTribMun></pTotTrib>`;
  }
  // Local taxable operation, no retention. For an active national municipality,
  // non-Simples ISS rate comes from municipal parametrization, not a guessed rate.
  return { issuer, values: `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>${federal}<totTrib>${total}</totTrib></trib>` };
}

/** Form parsing never supplies a default tax rate or class from the selected regime. */
export function readNationalTaxForm(data: FormData, regime: FiscalRegime): NationalTax {
  const number = (key: string) => {
    const raw = String(data.get(key) ?? "").trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error("Informe os percentuais fiscais com até duas casas decimais, inclusive quando forem zero.");
    return Math.round(Number(raw.replace(",", ".")) * 100);
  };
  const base = { regime, scenario: "local_tributavel_sem_retencoes" as const };
  if (regime === "mei") return nationalTaxSchema.parse(base);
  if (regime === "simples_nacional") return nationalTaxSchema.parse({ ...base, assessment: String(data.get("snAssessment") ?? ""), simpleRateBasisPoints: number("simpleRate") });
  const cst = String(data.get("pisCofinsCst") ?? "");
  const pisCofins = cst === "01" || cst === "02" ? { cst, baseInCents: number("pisCofinsBase"), pisRateBasisPoints: number("pisRate"), cofinsRateBasisPoints: number("cofinsRate") } : { cst };
  // Unexpected rates/bases are rejected rather than silently discarded for exempt CSTs.
  if (cst !== "01" && cst !== "02" && ["pisCofinsBase", "pisRate", "cofinsRate"].some((key) => String(data.get(key) ?? "").trim())) throw new Error("Para o CST sem débito, deixe base e alíquotas de PIS/COFINS em branco.");
  return nationalTaxSchema.parse({ ...base, pisCofins, approximate: { federalBasisPoints: number("approximateFederal"), stateBasisPoints: number("approximateState"), municipalBasisPoints: number("approximateMunicipal") } });
}
