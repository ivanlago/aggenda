import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { z } from "zod";
import type { NfseFiscalProfile } from "../../nfse-routing";
import { escapeXml } from "../xml";

export const salvadorNamespace = "http://www.abrasf.org.br/ABRASF/arquivos/nfse.xsd";
const digits = (length: number) => z.string().regex(new RegExp(`^\\d{${length}}$`));
const text = (max: number) => z.string().trim().min(1).max(max).refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v));
export const salvadorDraftSchema = z.object({
  channel: z.literal("salvador"),
  rpsNumber: z.string().regex(/^[1-9]\d{0,14}$/),
  rpsSeries: z.string().regex(/^[A-Za-z0-9]{1,5}$/),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/).refine((v) => Number.isFinite(Date.parse(v)) && new Date(Date.parse(v) - 3 * 3600_000).toISOString().slice(0, 19) === v.slice(0, 19)),
  payerDocument: z.string().regex(/^(\d{11}|\d{14})$/),
  payerName: text(115),
  address: z.object({ street: text(125), number: text(10), district: text(60), municipalityCode: digits(7), state: z.string().regex(/^[A-Z]{2}$/), zip: digits(8) }).strict(),
  description: text(1200),
  itemList: z.string().regex(/^\d{2}\.\d{2}$/),
  cnae: digits(7),
  nbs: digits(9),
  taxClassification: digits(6),
  operationIndicator: digits(6),
  amountInCents: z.number().int().positive().max(2_000_000_000),
  // Hundredths of a percentage point, entered explicitly; never infer taxes from regime.
  issRateBasisPoints: z.number().int().min(200).max(500),
  scenario: z.literal("presumido_local_sem_retencoes"),
}).strict();
export type SalvadorDraft = z.infer<typeof salvadorDraftSchema>;
export type SalvadorIssuer = Pick<NfseFiscalProfile, "cnpj" | "municipalRegistration" | "municipalityCode" | "taxRegime">;

export function assertSalvadorIssuer(profile: SalvadorIssuer) {
  if (profile.municipalityCode !== "2927408" || profile.taxRegime !== "lucro_presumido") throw new Error("O conector municipal inicial atende Salvador e Lucro Presumido.");
  if (!/^\d{14}$/.test(profile.cnpj) || !/^\d{1,15}$/.test(profile.municipalRegistration)) throw new Error("Confira CNPJ e inscrição municipal numérica de Salvador.");
}
export function salvadorRpsId(profile: SalvadorIssuer, draft: SalvadorDraft) {
  return `SSA_${profile.cnpj}_${profile.municipalRegistration}_${draft.rpsSeries}_${draft.rpsNumber}`;
}
export function issuerXml(profile: SalvadorIssuer) {
  return `<Cnpj>${profile.cnpj}</Cnpj><InscricaoMunicipal>${profile.municipalRegistration}</InscricaoMunicipal>`;
}
export function rpsIdentity(draft: SalvadorDraft) {
  return `<IdentificacaoRps><Numero>${draft.rpsNumber}</Numero><Serie>${draft.rpsSeries}</Serie><Tipo>1</Tipo></IdentificacaoRps>`;
}
export function buildSalvadorBatch(profile: SalvadorIssuer, sequence: string, input: SalvadorDraft) {
  assertSalvadorIssuer(profile);
  const draft = salvadorDraftSchema.parse(input);
  if (!/^[1-9]\d{0,14}$/.test(sequence)) throw new Error("Número do lote inválido.");
  const id = salvadorRpsId(profile, draft);
  const amount = (draft.amountInCents / 100).toFixed(2);
  const iss = (Math.round(draft.amountInCents * draft.issRateBasisPoints / 10000) / 100).toFixed(2);
  const { address } = draft;
  const xml = `<EnviarLoteRpsEnvio xmlns="${salvadorNamespace}"><LoteRps id="L${sequence}"><NumeroLote>${sequence}</NumeroLote>${issuerXml(profile)}<QuantidadeRps>1</QuantidadeRps><ListaRps><Rps><InfRps id="${id}">${rpsIdentity(draft)}<DataEmissao>${draft.issuedAt}</DataEmissao><NaturezaOperacao>1</NaturezaOperacao><OptanteSimplesNacional>2</OptanteSimplesNacional><IncentivadorCultural>2</IncentivadorCultural><Status>1</Status><Servico><Valores><ValorServicos>${amount}</ValorServicos><IssRetido>2</IssRetido><ValorIss>${iss}</ValorIss><BaseCalculo>${amount}</BaseCalculo><Aliquota>${(draft.issRateBasisPoints / 10000).toFixed(4)}</Aliquota><ValorLiquidoNfse>${amount}</ValorLiquidoNfse></Valores><ItemListaServico>${draft.itemList}</ItemListaServico><CodigoCnae>${draft.cnae}</CodigoCnae><Discriminacao>${escapeXml(draft.description)}</Discriminacao><CodigoMunicipio>2927408</CodigoMunicipio><NBS>${draft.nbs}</NBS><cClassTrib>${draft.taxClassification}</cClassTrib><INDOP>${draft.operationIndicator}</INDOP></Servico><Prestador>${issuerXml(profile)}</Prestador><Tomador><IdentificacaoTomador><CpfCnpj><${draft.payerDocument.length === 11 ? "Cpf" : "Cnpj"}>${draft.payerDocument}</${draft.payerDocument.length === 11 ? "Cpf" : "Cnpj"}></CpfCnpj></IdentificacaoTomador><RazaoSocial>${escapeXml(draft.payerName)}</RazaoSocial><Endereco><Endereco>${escapeXml(address.street)}</Endereco><Numero>${escapeXml(address.number)}</Numero><Bairro>${escapeXml(address.district)}</Bairro><CodigoMunicipio>${address.municipalityCode}</CodigoMunicipio><Uf>${address.state}</Uf><Cep>${address.zip}</Cep></Endereco></Tomador></InfRps></Rps></ListaRps></LoteRps></EnviarLoteRpsEnvio>`;
  return { id, xml };
}

// Algorithms belong to the published legacy Salvador schema. Isolated from national signing.
export function signSalvadorBatch(xml: string, privateKey: string, publicCert: string) {
  let signed = xml;
  for (const element of ["InfRps", "LoteRps"] as const) {
    const signature = new SignedXml({ privateKey, publicCert, idAttribute: "id", canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315", signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1" });
    signature.addReference({ xpath: `//*[local-name()='${element}']`, transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"], digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1" });
    signature.computeSignature(signed, { location: { reference: `//*[local-name()='${element}']`, action: "after" } });
    signed = signature.getSignedXml();
  }
  return signed;
}

export function parseSalvadorXml(xml: string) {
  if (Buffer.byteLength(xml) > 4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML municipal inválido.");
  return new DOMParser({ onError: () => { throw new Error("XML municipal inválido."); } }).parseFromString(xml, "text/xml");
}
export function children(node: Element, name: string, ns = salvadorNamespace): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1 && (child as Element).localName === name && (child as Element).namespaceURI === ns);
}
export function one(node: Element, name: string, ns = salvadorNamespace) {
  const found = children(node, name, ns);
  if (found.length !== 1) throw new Error("Resposta municipal incompleta ou ambígua.");
  return found[0];
}
export function scalar(node: Element, name: string) {
  const element = one(node, name);
  if (Array.from(element.childNodes).some((child) => child.nodeType === 1)) throw new Error("Campo municipal inválido.");
  return element.textContent?.trim() ?? "";
}
export function municipalPayload(xml: string, rootName: string) {
  const doc = parseSalvadorXml(xml);
  const root = doc.documentElement;
  if (!root || root.localName !== rootName || root.namespaceURI !== salvadorNamespace) throw new Error("Resposta fiscal municipal não reconhecida.");
  return root;
}
export function acceptedSalvadorBatch(xml: string, expectedLot: string) {
  const root = municipalPayload(xml, "EnviarLoteRpsResposta");
  const lot = scalar(root, "NumeroLote"), protocol = scalar(root, "Protocolo");
  if (lot !== expectedLot || !/^[A-Za-z0-9-]{1,50}$/.test(protocol)) throw new Error("Protocolo não corresponde ao lote.");
  return protocol;
}
export function salvadorReturnCodes(xml: string, rootName: "EnviarLoteRpsResposta" | "ConsultarNfseRpsResposta") {
  const root = municipalPayload(xml, rootName);
  const lists = children(root, "ListaMensagemRetorno");
  if (lists.length !== 1) return [];
  return children(lists[0], "MensagemRetorno").slice(0, 20).map((item) => scalar(item, "Codigo")).filter((code) => /^[A-Za-z0-9_-]{1,20}$/.test(code));
}
export function authorizedSalvadorInvoice(xml: string, profile: SalvadorIssuer, draft: SalvadorDraft) {
  const root = municipalPayload(xml, "ConsultarNfseRpsResposta");
  const comp = one(root, "CompNfse"), inf = one(one(comp, "Nfse"), "InfNfse");
  const issuer = one(one(inf, "PrestadorServico"), "IdentificacaoPrestador");
  const rps = one(inf, "IdentificacaoRps");
  const values = one(one(inf, "Servico"), "Valores");
  const payer = one(one(one(inf, "TomadorServico"), "IdentificacaoTomador"), "CpfCnpj");
  const amount = scalar(values, "ValorServicos");
  if (scalar(issuer, "Cnpj") !== profile.cnpj || scalar(issuer, "InscricaoMunicipal") !== profile.municipalRegistration || scalar(rps, "Numero") !== draft.rpsNumber || scalar(rps, "Serie") !== draft.rpsSeries || scalar(rps, "Tipo") !== "1" || !/^\d{1,14}(?:\.\d{1,2})?$/.test(amount) || Math.round(Number(amount) * 100) !== draft.amountInCents || scalar(payer, draft.payerDocument.length === 11 ? "Cpf" : "Cnpj") !== draft.payerDocument || scalar(one(inf, "OrgaoGerador"), "CodigoMunicipio") !== "2927408") throw new Error("A nota retornada não corresponde ao RPS e ao recebimento da clínica.");
  const number = scalar(inf, "Numero"), verificationCode = scalar(inf, "CodigoVerificacao");
  if (!/^[1-9]\d{0,14}$/.test(number) || !/^[A-Za-z0-9]{1,9}$/.test(verificationCode)) throw new Error("Identificação da nota inválida.");
  return { number, verificationCode, xml: new XMLSerializer().serializeToString(comp) };
}
export function buildSalvadorRpsQuery(profile: SalvadorIssuer, draft: SalvadorDraft) {
  assertSalvadorIssuer(profile);
  salvadorDraftSchema.parse(draft);
  return `<ConsultarNfseRpsEnvio xmlns="${salvadorNamespace}">${rpsIdentity(draft)}<Prestador>${issuerXml(profile)}</Prestador></ConsultarNfseRpsEnvio>`;
}
export function buildSalvadorBatchQuery(profile: SalvadorIssuer, protocol: string, operation: "batch" | "batchStatus") {
  assertSalvadorIssuer(profile);
  if (!/^[A-Za-z0-9-]{1,50}$/.test(protocol)) throw new Error("Protocolo municipal inválido.");
  const root = operation === "batch" ? "ConsultarLoteRpsEnvio" : "ConsultarSituacaoLoteRpsEnvio";
  return `<${root} xmlns="${salvadorNamespace}"><Prestador>${issuerXml(profile)}</Prestador><Protocolo>${protocol}</Protocolo></${root}>`;
}
