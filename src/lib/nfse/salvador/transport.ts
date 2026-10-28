import { request } from "node:https";
import { z } from "zod";
import type { NfseCertificateSecret } from "../../nfse-routing";
import { escapeXml } from "../xml";
import { one, parseSalvadorXml } from "./xml";

const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,79}$/);
const uri = z.string().regex(/^https?:\/\/[^\s"<>\r\n]{1,300}$/);
const binding = z.object({ namespace: uri, action: uri, request: name, parameter: name, response: name, result: name }).strict();
export const salvadorContractSchema = z.object({
  soapVersion: z.enum(["1.1", "1.2"]),
  reviewedForSandbox: z.literal(true),
  layout2026AcceptedForSandbox: z.literal(true),
  // Fill from the authenticated WSDL. Do not guess WCF interface names or SOAPAction.
  send: binding, byRps: binding, batch: binding, batchStatus: binding,
}).strict();
export type SalvadorContract = z.infer<typeof salvadorContractSchema>;
export type SalvadorOperation = "send" | "byRps" | "batch" | "batchStatus";
export type SalvadorTransport = (operation: SalvadorOperation, xml: string) => Promise<string>;
const paths: Record<SalvadorOperation, string> = { send: "ENVIOLOTERPS/EnvioLoteRPS.svc", byRps: "CONSULTANFSERPS/ConsultaNfseRPS.svc", batch: "CONSULTALOTERPS/ConsultaLoteRPS.svc", batchStatus: "CONSULTASITUACAOLOTERPS/ConsultaSituacaoLoteRPS.svc" };
export function readSalvadorSandboxContract(): SalvadorContract | null {
  if (process.env.NFSE_SALVADOR_SANDBOX_ENABLED !== "true") return null;
  try { return salvadorContractSchema.parse(JSON.parse(process.env.NFSE_SALVADOR_SOAP_CONTRACT ?? "")); } catch { return null; }
}
const soapNs = (version: "1.1" | "1.2") => version === "1.1" ? "http://schemas.xmlsoap.org/soap/envelope/" : "http://www.w3.org/2003/05/soap-envelope";
export function salvadorSoapEnvelope(contract: SalvadorContract, operation: SalvadorOperation, xml: string) {
  const item = salvadorContractSchema.parse(contract)[operation];
  if (!item) throw new Error("Operação municipal inválida.");
  parseSalvadorXml(xml);
  return `<s:Envelope xmlns:s="${soapNs(contract.soapVersion)}"><s:Body><${item.request} xmlns="${escapeXml(item.namespace)}"><${item.parameter}>${escapeXml(xml)}</${item.parameter}></${item.request}></s:Body></s:Envelope>`;
}
export function unwrapSalvadorSoap(contract: SalvadorContract, operation: SalvadorOperation, xml: string) {
  const item = salvadorContractSchema.parse(contract)[operation];
  const doc = parseSalvadorXml(xml), ns = soapNs(contract.soapVersion), root = doc.documentElement;
  if (!root || root.localName !== "Envelope" || root.namespaceURI !== ns) throw new Error("Envelope SOAP não reconhecido.");
  const body = one(root, "Body", ns);
  if (Array.from(body.childNodes).filter((node) => node.nodeType === 1).length !== 1) throw new Error("Resposta SOAP ambígua.");
  const result = one(one(body, item.response, item.namespace), item.result, item.namespace);
  if (Array.from(result.childNodes).some((node) => node.nodeType === 1)) throw new Error("Resultado SOAP deve conter XML serializado.");
  const payload = result.textContent ?? "";
  parseSalvadorXml(payload);
  return payload;
}

export function salvadorSandboxTransport(secret: NfseCertificateSecret, configuration: SalvadorContract, environment: string): SalvadorTransport {
  if (environment !== "sandbox") throw new Error("O conector Salvador permite somente homologação. Produção bloqueada.");
  const contract = salvadorContractSchema.parse(configuration);
  return (operation, xml) => new Promise((resolve, reject) => {
    if (!Object.hasOwn(paths, operation)) return reject(new Error("Operação municipal inválida."));
    const body = salvadorSoapEnvelope(contract, operation, xml), item = contract[operation];
    const req = request(new URL(`https://notahml.salvador.ba.gov.br/rps/${paths[operation]}`), {
      method: "POST", pfx: Buffer.from(secret.pfxBase64, "base64"), passphrase: secret.password, minVersion: "TLSv1.2",
      headers: { "Content-Type": contract.soapVersion === "1.1" ? "text/xml; charset=utf-8" : `application/soap+xml; charset=utf-8; action="${item.action}"`, ...(contract.soapVersion === "1.1" ? { SOAPAction: `"${item.action}"` } : {}), "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4_000_000) res.destroy(new Error("Resposta municipal excede o limite.")); else chunks.push(chunk); });
      res.on("error", () => reject(new Error("Consulta municipal interrompida; não reenvie o RPS.")));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("Resultado municipal não confirmado. Consulte o RPS antes de reenviar."));
        try { resolve(unwrapSalvadorSoap(contract, operation, Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new Error("Resposta municipal não reconhecida. Consulte o RPS antes de reenviar.")); }
      });
    });
    const timer = setTimeout(() => req.destroy(), 20_000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(new Error("Comunicação municipal não confirmada. Consulte o RPS antes de reenviar.")));
    req.end(body);
  });
}
