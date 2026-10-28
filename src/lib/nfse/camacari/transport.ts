import { request } from "node:https";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { z } from "zod";
import type { NfseCertificateSecret } from "../../nfse-routing";
import { escapeXml } from "../xml";

// Fill only from the authenticated municipal WSDL and the current 2026 XSD.
// Neither Salvador's WCF bindings nor national DPS bindings apply here.
const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,79}$/);
const uri = z.string().regex(/^https?:\/\/[^\s"<>\r\n]{1,300}$/);
const binding = z.object({ namespace: uri, action: uri, request: name, parameter: name, response: name, result: name, payloadRoot: name, payloadNamespace: uri }).strict();
export const camacariContractSchema = z.object({
  reviewedForSandbox: z.literal(true),
  layout2026AcceptedForSandbox: z.literal(true),
  trainingAccessConfirmed: z.literal(true),
  soapVersion: z.enum(["1.1", "1.2"]),
  schemaSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sendSync: binding, byRps: binding, cancel: binding, substitute: binding,
}).strict();
export type CamacariContract = z.infer<typeof camacariContractSchema>;
export type CamacariOperation = "sendSync" | "byRps" | "cancel" | "substitute";
const operations = ["sendSync", "byRps", "cancel", "substitute"] as const;
const endpoint = "https://201.18.232.29/nfse/ws";
const soapNamespace = (version: "1.1" | "1.2") => version === "1.1" ? "http://schemas.xmlsoap.org/soap/envelope/" : "http://www.w3.org/2003/05/soap-envelope";

export function readCamacariSandboxContract(): CamacariContract | null {
  if (process.env.NFSE_CAMACARI_SANDBOX_ENABLED !== "true") return null;
  try { return camacariContractSchema.parse(JSON.parse(process.env.NFSE_CAMACARI_SOAP_CONTRACT ?? "")); } catch { return null; }
}
function parse(xml: string, limit = 4_000_000) {
  if (Buffer.byteLength(xml, "utf8") > limit || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML de Camaçari inválido ou acima do limite.");
  const document = new DOMParser({ onError: () => { throw new Error("XML de Camaçari inválido."); } }).parseFromString(xml, "text/xml");
  if (!document.documentElement) throw new Error("XML de Camaçari vazio.");
  return document.documentElement;
}
function child(parent: Element, localName: string, namespace: string): Element {
  const children = Array.from(parent.childNodes).filter((node) => node.nodeType === 1) as Element[];
  if (children.length !== 1 || children[0].localName !== localName || children[0].namespaceURI !== namespace) throw new Error("Resposta SOAP de Camaçari ambígua ou não reconhecida.");
  return children[0];
}

export function camacariSoapEnvelope(configuration: CamacariContract, operation: CamacariOperation, xml: string) {
  const contract = camacariContractSchema.parse(configuration);
  if (!operations.includes(operation)) throw new Error("Operação de Camaçari inválida.");
  const item = contract[operation];
  const payload = parse(xml, 512 * 1024);
  if (payload.localName !== item.payloadRoot || payload.namespaceURI !== item.payloadNamespace) throw new Error("XML não corresponde ao contrato de Camaçari.");
  const envelope = `<s:Envelope xmlns:s="${soapNamespace(contract.soapVersion)}"><s:Body><${item.request} xmlns="${escapeXml(item.namespace)}"><${item.parameter}>${escapeXml(xml)}</${item.parameter}></${item.request}></s:Body></s:Envelope>`;
  if (Buffer.byteLength(envelope, "utf8") > 512 * 1024) throw new Error("Mensagem de Camaçari excede 512 KB.");
  return envelope;
}

export function unwrapCamacariSoap(configuration: CamacariContract, operation: CamacariOperation, xml: string) {
  const contract = camacariContractSchema.parse(configuration);
  if (!operations.includes(operation)) throw new Error("Operação de Camaçari inválida.");
  const item = contract[operation], root = parse(xml), ns = soapNamespace(contract.soapVersion);
  if (root.localName !== "Envelope" || root.namespaceURI !== ns) throw new Error("Envelope SOAP de Camaçari inválido.");
  const body = child(root, "Body", ns);
  const result = child(child(body, item.response, item.namespace), item.result, item.namespace);
  if (Array.from(result.childNodes).some((node) => node.nodeType === 1)) throw new Error("Resultado municipal deve conter XML serializado.");
  const payload = result.textContent ?? "";
  parse(payload);
  return payload;
}

/** Internal transport foundation. No UI action is enabled until schema/signing and custody are homologated. */
export function camacariSandboxTransport(secret: NfseCertificateSecret, configuration: CamacariContract, environment: string,
  validateSignedPayload: (operation: CamacariOperation, xml: string, schemaSha256: string) => Promise<void>) {
  if (environment !== "sandbox") throw new Error("Produção de Camaçari bloqueada até homologação.");
  const contract = camacariContractSchema.parse(configuration);
  return async (operation: CamacariOperation, xml: string): Promise<string> => {
    const body = camacariSoapEnvelope(contract, operation, xml);
    // Must check against the reviewed schema and signature policy before opening a socket.
    await validateSignedPayload(operation, xml, contract.schemaSha256);
    return new Promise((resolve, reject) => {
      const item = contract[operation];
      const req = request(endpoint, {
        method: "POST", pfx: Buffer.from(secret.pfxBase64, "base64"), passphrase: secret.password,
        minVersion: "TLSv1.2", rejectUnauthorized: true,
        headers: { "Content-Type": contract.soapVersion === "1.1" ? "text/xml; charset=utf-8" : `application/soap+xml; charset=utf-8; action="${item.action}"`, ...(contract.soapVersion === "1.1" ? { SOAPAction: `"${item.action}"` } : {}), "Content-Length": Buffer.byteLength(body) },
      }, (res) => {
        const chunks: Buffer[] = []; let bytes = 0;
        res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4_000_000) res.destroy(new Error("Resposta excede o limite.")); else chunks.push(chunk); });
        res.on("error", () => reject(new Error("Resposta de Camaçari interrompida; consulte o RPS antes de reenviar.")));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error("Resultado de Camaçari não confirmado; consulte o RPS antes de reenviar."));
          try { resolve(unwrapCamacariSoap(contract, operation, Buffer.concat(chunks).toString("utf8"))); }
          catch { reject(new Error("Resposta de Camaçari não reconhecida; consulte o RPS antes de reenviar.")); }
        });
      });
      const timer = setTimeout(() => req.destroy(), 20_000);
      req.on("close", () => clearTimeout(timer));
      req.on("error", () => reject(new Error("Comunicação de Camaçari não confirmada; consulte o RPS antes de reenviar.")));
      // No redirects, automatic retries or disabled TLS verification.
      req.end(body);
    });
  };
}
