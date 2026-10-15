import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { z } from "zod";
import type { NfseFiscalProfile } from "../nfse-routing";
import type { FiscalEnvironment } from "./government";

export const fiscalDraftSchema = z.object({
  payerDocument: z.string().regex(/^(\d{11}|\d{14})$/),
  payerName: z.string().trim().min(2).max(150),
  description: z.string().trim().min(3).max(2000),
  serviceCode: z.string().regex(/^\d{6}$/),
  municipalServiceCode: z.string().regex(/^\d{3}$/).optional(),
  nbs: z.string().regex(/^\d{9}$/).optional(),
  competence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
  amountInCents: z.number().int().positive().max(2_000_000_000),
  totalTaxPercent: z.number().min(0).max(99.99),
});
export type FiscalDraft = z.infer<typeof fiscalDraftSchema>;
const ns = "http://www.sped.fazenda.gov.br/nfse";
export const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

export function dpsId(profile: NfseFiscalProfile, series: string, number: string) {
  if (!/^\d{1,5}$/.test(series) || Number(series) < 1 || Number(series) > 49999 || !/^[1-9]\d{0,14}$/.test(number)) throw new Error("Série de aplicativo próprio deve estar entre 1 e 49999; confira também o número da DPS.");
  return `DPS${profile.municipalityCode}2${profile.cnpj}${series.padStart(5, "0")}${number.padStart(15, "0")}`;
}

export function buildDps(profile: NfseFiscalProfile, environment: FiscalEnvironment, series: string, number: string, input: FiscalDraft, now = new Date()) {
  const draft = fiscalDraftSchema.parse(input);
  // Initial supported fiscal scenario is explicit. Other regimes require dedicated rules.
  if (profile.taxRegime !== "simples_nacional") throw new Error("O piloto atende Simples Nacional, sem retenções, benefícios ou regime especial. Outros enquadramentos precisam de análise fiscal.");
  const id = dpsId(profile, series, number);
  const xml = `<DPS xmlns="${ns}" versao="1.01"><infDPS Id="${id}"><tpAmb>${environment === "production" ? 1 : 2}</tpAmb><dhEmi>${now.toISOString().replace(/\.\d{3}Z$/, "+00:00")}</dhEmi><verAplic>Aggenda_1.0</verAplic><serie>${Number(series)}</serie><nDPS>${number}</nDPS><dCompet>${draft.competence}</dCompet><tpEmit>1</tpEmit><cLocEmi>${profile.municipalityCode}</cLocEmi><prest><CNPJ>${profile.cnpj}</CNPJ><IM>${escapeXml(profile.municipalRegistration)}</IM><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest><toma><${draft.payerDocument.length === 11 ? "CPF" : "CNPJ"}>${draft.payerDocument}</${draft.payerDocument.length === 11 ? "CPF" : "CNPJ"}><xNome>${escapeXml(draft.payerName)}</xNome></toma><serv><locPrest><cLocPrestacao>${profile.municipalityCode}</cLocPrestacao></locPrest><cServ><cTribNac>${draft.serviceCode}</cTribNac>${draft.municipalServiceCode ? `<cTribMun>${draft.municipalServiceCode}</cTribMun>` : ""}<xDescServ>${escapeXml(draft.description)}</xDescServ>${draft.nbs ? `<cNBS>${draft.nbs}</cNBS>` : ""}</cServ></serv><valores><vServPrest><vServ>${(draft.amountInCents / 100).toFixed(2)}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>${draft.totalTaxPercent.toFixed(2)}</pTotTribSN></totTrib></trib></valores></infDPS></DPS>`;
  return { id, xml };
}

export function signFiscalXml(xml: string, element: "infDPS" | "infPedReg", privateKey: string, publicCert: string) {
  const signature = new SignedXml({ privateKey, publicCert, canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315", signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" });
  signature.addReference({ xpath: `//*[local-name()='${element}']`, transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"], digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256" });
  signature.computeSignature(xml, { location: { reference: `//*[local-name()='${element}']`, action: "after" } });
  return signature.getSignedXml();
}

export function parseFiscalXml(xml: string) {
  if (xml.length > 4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML fiscal inválido.");
  const doc = new DOMParser({ onError: () => { throw new Error("XML fiscal inválido."); } }).parseFromString(xml, "text/xml");
  if (!doc.documentElement || doc.documentElement.namespaceURI !== ns) throw new Error("Namespace fiscal inválido.");
  return doc;
}

export function authorizedInvoice(xml: string, expected: { dpsId: string; cnpj: string; environment: FiscalEnvironment; amountInCents: number }) {
  const doc = parseFiscalXml(xml);
  const info = doc.getElementsByTagNameNS(ns, "infNFSe");
  const dps = doc.getElementsByTagNameNS(ns, "infDPS");
  if (doc.documentElement?.localName !== "NFSe" || info.length !== 1 || dps.length !== 1) throw new Error("Documento autorizado não reconhecido.");
  const key = info[0].getAttribute("Id")?.replace(/^NFS/, "");
  const field = (tag: string) => dps[0].getElementsByTagNameNS(ns, tag)[0]?.textContent;
  if (!key || !/^\d{50}$/.test(key) || dps[0].getAttribute("Id") !== expected.dpsId || field("CNPJ") !== expected.cnpj || field("tpAmb") !== (expected.environment === "production" ? "1" : "2") || Math.round(Number(field("vServ")) * 100) !== expected.amountInCents) throw new Error("A nota retornada não corresponde à solicitação.");
  const number = info[0].getElementsByTagNameNS(ns, "nNFSe")[0]?.textContent;
  if (!number || !/^\d+$/.test(number)) throw new Error("Número da nota ausente.");
  return { key, number };
}

export function buildCancellation(key: string, cnpj: string, environment: FiscalEnvironment, reason: string, code: string, now = new Date()) {
  const description = reason.trim();
  if (!/^\d{50}$/.test(key) || !/^\d{14}$/.test(cnpj) || !["1", "2", "9"].includes(code) || description.length < 15 || description.length > 255) throw new Error("Informe um motivo de cancelamento entre 15 e 255 caracteres e um código válido.");
  return `<pedRegEvento xmlns="${ns}" versao="1.01"><infPedReg Id="PRE${key}101101"><tpAmb>${environment === "production" ? 1 : 2}</tpAmb><verAplic>Aggenda_1.0</verAplic><dhEvento>${now.toISOString().replace(/\.\d{3}Z$/, "+00:00")}</dhEvento><CNPJAutor>${cnpj}</CNPJAutor><chNFSe>${key}</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>${code}</cMotivo><xMotivo>${escapeXml(description)}</xMotivo></e101101></infPedReg></pedRegEvento>`;
}

export function confirmedCancellation(xml: string, expected: { key: string; cnpj: string; environment: FiscalEnvironment }) {
  const doc = parseFiscalXml(xml);
  const events = doc.getElementsByTagNameNS(ns, "infEvento");
  const requests = doc.getElementsByTagNameNS(ns, "infPedReg");
  if (doc.documentElement?.localName !== "evento" || events.length !== 1 || requests.length !== 1 || doc.getElementsByTagNameNS(ns, "e101101").length !== 1) throw new Error("Evento de cancelamento não reconhecido.");
  const value = (tag: string) => requests[0].getElementsByTagNameNS(ns, tag)[0]?.textContent;
  if (requests[0].getAttribute("Id") !== `PRE${expected.key}101101` || events[0].getAttribute("Id") !== `EVT${expected.key}101101001` || value("chNFSe") !== expected.key || value("CNPJAutor") !== expected.cnpj || value("tpAmb") !== (expected.environment === "production" ? "1" : "2")) throw new Error("O evento retornado não corresponde ao cancelamento solicitado.");
}
