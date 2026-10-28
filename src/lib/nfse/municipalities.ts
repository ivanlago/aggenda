import { fiscalChannelFor, fiscalRegimeSchema } from "./tax-regimes";

export const nfseMunicipalities = [
  {
    code: "2905701",
    name: "Camaçari/BA",
    provider: "Próprio",
    format: "Próprio (ABRASF)",
    channel: "municipal",
    cancellation: "Cancelamento e substituição documentados pela prefeitura; operações no Aggenda aguardam homologação.",
    requirements: "Certificado ICP-Brasil, cadastro municipal e item de serviço. Leiaute de NBS/IBS/CBS e acesso ao treinamento aguardam validação.",
    source: "https://focusnfe.com.br/guides/nfse/municipios-integrados/camacari-ba/",
    currentSource: "https://sefaz.camacari.ba.gov.br/portal-nfse-sefaz-camacari/",
    history: "A Focus não oferece homologação municipal; a prefeitura publica treinamento, sujeito à confirmação de acesso. Simples ME/EPP: transição ao nacional em 01/11/2026.",
  },
  {
    code: "2927408",
    name: "Salvador/BA",
    provider: "Próprio",
    format: "Próprio (ABRASF)",
    channel: "municipal",
    cancellation: "Cancelamento pelo portal ou solicitação à prefeitura; indisponível no webservice da Focus.",
    requirements: "CPF/CNPJ e endereço do tomador, item da lista de serviços e CNAE. Confira também os campos de IBS/CBS aplicáveis.",
    source: "https://focusnfe.com.br/guides/nfse/municipios-integrados/salvador-ba/",
  },
  {
    code: "2919207",
    name: "Lauro de Freitas/BA",
    provider: "Ambiente Nacional",
    format: "NFS-e Nacional (DPS)",
    channel: "national",
    cancellation: "O guia nacional da Focus prevê cancelamento; depende da habilitação e das regras da nota.",
    requirements: "Código de tributação nacional, dados do prestador e tomador e tributação do serviço. Confirme a inscrição municipal no cadastro nacional.",
    source: "https://focusnfe.com.br/guides/nfse/municipios-integrados/lauro-de-freitas-ba/",
    currentSource: "https://focusnfe.com.br/guides/nfse/municipios-integrados/municipios-da-nfse-nacional/",
    history: "Referência anterior: Metrópolis / Próprio (ABRASF). A URL municipal da Focus agora redireciona ao guia nacional; confirme o canal vigente para o CNPJ antes da homologação.",
  },
] as const;

export type NfseTaxRegime = "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";
export const nfseReferenceReviewedAt = "2026-10-27";

// Planning reference only. Never use this catalog as fiscal authorization or a transport URL.
export function nfseMunicipalityReference(code: string, regime: string, referenceDate = new Date()) {
  const municipality = nfseMunicipalities.find((item) => item.code === code);
  if (!municipality) return null;
  const parsedRegime = fiscalRegimeSchema.safeParse(regime);
  const nationalRegime = parsedRegime.success && fiscalChannelFor(code, parsedRegime.data, referenceDate) === "national";
  const regimeTransition = municipality.channel === "municipal" && nationalRegime;
  return {
    ...municipality,
    suggestedChannel: regimeTransition ? "national" as const : municipality.channel,
    providerForRegime: regimeTransition ? "Ambiente Nacional — habilitação e transição a confirmar" : municipality.provider,
    regimeNotice: regime === "mei"
      ? "MEI: emissão pelo canal nacional, com indicador próprio e sem totalização percentual do Simples. Fluxo em homologação."
      : regime === "simples_nacional"
        ? "Simples Nacional: confira a transição ao Emissor Nacional e a habilitação do CNPJ. A referência não muda automaticamente o emissor cadastrado."
        : code === "2905701" ? "Lucro Presumido/Real: integração municipal em preparação. Emissão no Aggenda aguarda contrato atualizado e homologação." : "Lucro Presumido/Real: cenários locais sem retenções implementados nos respectivos canais. Combinações fiscais e habilitação do CNPJ ainda exigem homologação.",
    authentication: "Certificado digital; na integração da Focus, modelo A1 da empresa emissora.",
    automaticIssuanceAvailable: false as const,
    reviewedAt: nfseReferenceReviewedAt,
  };
}
