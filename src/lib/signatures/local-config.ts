import roots from "./trust/roots.json";
import { IcpBrasilTrustValidator } from "./icp-trust";
import { signatureEncryption } from "./storage-config";
import { downloadPublicPki } from "./public-download";

export function localSignatureReadiness(organizationId: string): { ready: boolean; message: string } {
  const enabled = (process.env.SIGNATURE_PILOT_ORGANIZATIONS ?? "").split(",").map(value => value.trim());
  if (!enabled.includes(organizationId)) return { ready: false, message: "Assinatura profissional em homologação. A liberação do piloto é feita pela administração do Aggenda." };
  try { signatureEncryption(); } catch { return { ready: false, message: "Armazenamento seguro de assinaturas indisponível. Contate o suporte." }; }
  if (!roots.length) return { ready: false, message: "Cadeia de confiança ICP-Brasil indisponível." };
  return { ready: true, message: "Piloto de homologação: use um documento de teste sem finalidade clínica até concluir a validação real." };
}

export function localTrustValidator() {
  const downloads = new Map<string, Promise<Uint8Array>>();
  return new IcpBrasilTrustValidator(roots.map(root => Buffer.from(root.derBase64, "base64")), url => {
    if (!downloads.has(url)) downloads.set(url, downloadPublicPki(url));
    return downloads.get(url)!;
  });
}
