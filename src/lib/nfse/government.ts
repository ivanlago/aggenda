import { request } from "node:https";
import { gunzipSync, gzipSync } from "node:zlib";
import type { NfseCertificateSecret } from "../nfse-routing";

export type FiscalEnvironment = "sandbox" | "production";
export type FiscalResponse = { status: number; body: Record<string, unknown> };
export type FiscalTransport = (path: string, options?: { method?: "GET" | "POST"; body?: unknown; service?: "parameters" | "sefin" | "danfse" }) => Promise<FiscalResponse>;

export function governmentTransport(secret: NfseCertificateSecret, environment: FiscalEnvironment): FiscalTransport {
  return (path, options = {}) => new Promise((resolve, reject) => {
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(path)) return reject(new Error("Caminho fiscal inválido."));
    const production = environment === "production";
    const base = options.service === "parameters" ? `https://adn.${production ? "" : "producaorestrita."}nfse.gov.br/parametrizacao`
      : options.service === "danfse" ? `https://adn.${production ? "" : "producaorestrita."}nfse.gov.br/danfse`
      : production ? "https://sefin.nfse.gov.br/SefinNacional" : "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional";
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const req = request(new URL(`${base}${path}`), { method: options.method ?? "GET", pfx: Buffer.from(secret.pfxBase64, "base64"), passphrase: secret.password, minVersion: "TLSv1.2", headers: { accept: "application/json", ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}) } }, (res) => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4_000_000) { res.destroy(); req.destroy(new Error("Resposta fiscal excede o limite.")); } else chunks.push(chunk); });
      res.on("error", () => reject(new Error("Conexão fiscal interrompida. Consulte o resultado antes de reenviar.")));
      res.on("end", () => {
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
          resolve({ status: res.statusCode ?? 0, body: parsed as Record<string, unknown> });
        } catch { reject(new Error("Resposta fiscal não reconhecida. Consulte o resultado antes de reenviar.")); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error("Tempo esgotado. Consulte o resultado antes de reenviar.")), 20_000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(new Error("Falha na comunicação fiscal. Verifique o certificado e consulte o resultado antes de reenviar.")));
    req.end(body);
  });
}

export const compressFiscalXml = (xml: string) => gzipSync(Buffer.from(xml, "utf8")).toString("base64");
export function decompressFiscalXml(value: unknown) {
  if (typeof value !== "string" || value.length > 4_000_000) throw new Error("XML fiscal ausente ou inválido.");
  return gunzipSync(Buffer.from(value, "base64"), { maxOutputLength: 4_000_000 }).toString("utf8");
}

export function fiscalRejection(response: FiscalResponse) {
  // Persist only public error codes; responses may contain fiscal or patient data.
  const errors = response.body.erros;
  if (response.status !== 400 || !Array.isArray(errors) || !errors.length) return null;
  const codes = errors.map((error) => error && typeof error === "object" ? (error as Record<string, unknown>).Codigo ?? (error as Record<string, unknown>).codigo : null)
    .filter((code): code is string => typeof code === "string" && /^[A-Z0-9_-]{1,20}$/.test(code));
  return codes.length ? `Rejeição fiscal: ${codes.join(", ")}. Revise os dados com seu contador.` : null;
}

/** Limited to pre-authorization errors verified in the official layout/rule annex.
 * All unknown, duplicate or infrastructure errors remain uncertain.
 */
export function definitiveFiscalRejection(response: FiscalResponse, dpsId: string) {
  const allowed = new Set(["E0001", "E0004", "E0006", "E0008", "E0010"]);
  if (response.status !== 400 || response.body.idDPS !== dpsId || response.body.chaveAcesso || response.body.nfseXmlGZipB64 || !Array.isArray(response.body.erros) || !response.body.erros.length) return null;
  const codes = response.body.erros.map((error: unknown) => error && typeof error === "object" ? (error as Record<string, unknown>).Codigo : null);
  return codes.every((code) => typeof code === "string" && allowed.has(code)) ? fiscalRejection(response) : null;
}
