import forge from "node-forge";
import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import type { NfseCertificateSecret } from "../nfse-routing";

export function readFiscalCertificate(secret: NfseCertificateSecret, cnpj: string, now = new Date()) {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(secret.pfxBase64)), false, secret.password);
  } catch { throw new Error("Não foi possível abrir o A1. Confira o arquivo e a senha."); }
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const plainKeys = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const privateKey = [...keyBags, ...plainKeys].find((bag) => bag.key)?.key;
  if (!privateKey) throw new Error("O arquivo não contém uma chave privada RSA utilizável.");
  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const publicDer = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "der", type: "spki" });
  const certificates = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certificate = certificates.map((bag) => bag.cert).find((cert) => cert && new X509Certificate(forge.pki.certificateToPem(cert)).publicKey.export({ format: "der", type: "spki" }).equals(publicDer));
  if (!certificate) throw new Error("Não foi encontrado o certificado correspondente à chave privada.");
  if (now < certificate.validity.notBefore || now >= certificate.validity.notAfter) throw new Error("O certificado está vencido ou ainda não é válido.");
  const eku = certificate.getExtension("extKeyUsage") as { clientAuth?: boolean } | null;
  if (!eku?.clientAuth) throw new Error("O certificado precisa permitir autenticação de cliente.");
  // ICP-Brasil identifies a legal entity in otherName, OID 2.16.76.1.3.3.
  const san = certificate.getExtension("subjectAltName") as { value?: string } | null;
  let certificateCnpj: string | undefined;
  function visit(node: forge.asn1.Asn1) {
    if (Array.isArray(node.value)) {
      const oid = node.value[0];
      if (oid?.type === forge.asn1.Type.OID && typeof oid.value === "string" && forge.asn1.derToOid(oid.value) === "2.16.76.1.3.3") {
        function digits(value: forge.asn1.Asn1): string | undefined {
          if (typeof value.value === "string") return /^\d{14}$/.test(value.value) ? value.value : undefined;
          return value.value.map(digits).find(Boolean);
        }
        certificateCnpj = node.value.slice(1).map(digits).find(Boolean);
      }
      node.value.forEach(visit);
    }
  }
  if (san?.value) visit(forge.asn1.fromDer(san.value));
  if (certificateCnpj !== cnpj) throw new Error("O certificado deve pertencer ao CNPJ informado para a clínica.");
  return { privateKeyPem, certificatePem: forge.pki.certificateToPem(certificate), expiresAt: certificate.validity.notAfter.toISOString(), fingerprint: new X509Certificate(forge.pki.certificateToPem(certificate)).fingerprint256 };
}
