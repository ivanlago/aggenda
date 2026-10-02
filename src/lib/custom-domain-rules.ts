import { createHmac } from "node:crypto";
import { domainToASCII } from "node:url";
import { isIP } from "node:net";

export type DomainRecord = { type: string; name: string; value: string; purpose: string };
export type DomainState = {
  domain: string | null;
  status: "empty" | "pending" | "ownership" | "dns" | "https" | "connected";
  records: DomainRecord[];
  message?: string;
};

export function normalizeCustomDomain(input: string, appUrl?: string) {
  let candidate = input.trim().toLowerCase();
  if (/^https?:\/\//.test(candidate)) candidate = candidate.replace(/^https?:\/\//, "");
  candidate = candidate.replace(/\/$/, "").replace(/\.$/, "");
  if (/[\s:/@?#\\]/.test(candidate)) throw new Error("Informe apenas o domínio, sem caminho, porta ou credenciais.");
  const domain = domainToASCII(candidate);
  const labels = domain.split(".");
  if (!domain || domain.length > 253 || isIP(domain) || labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/^[a-z][a-z0-9-]*$/.test(labels.at(-1)!)) throw new Error("Informe um domínio válido, sem caminho ou porta. Ex.: agenda.suaclinica.com.br.");
  if (["localhost", "local", "internal", "test", "invalid", "example"].includes(labels.at(-1)!) || domain.endsWith(".vercel.app")) throw new Error("Use um domínio público pertencente à sua empresa.");
  const platformHost = appUrl ? new URL(appUrl).hostname.replace(/^www\./, "") : "aggenda.app.br";
  if (domain === platformHost || domain.endsWith(`.${platformHost}`) || domain === "aggenda.app.br" || domain.endsWith(".aggenda.app.br")) throw new Error("Este endereço é reservado ao Aggenda.");
  return domain;
}

export function ownershipRecord(organizationId: string, domain: string, secret: string): DomainRecord {
  if (!secret) throw new Error("A configuração de segurança do domínio está indisponível.");
  const token = createHmac("sha256", secret).update(`custom-domain:${organizationId}:${domain}`).digest("hex");
  return { type: "TXT", name: `_aggenda-verification.${domain}`, value: `aggenda=${token}`, purpose: "Confirmar que o domínio pertence à sua empresa" };
}

export type ProjectDomain = { name: string; apexName: string; verified: boolean; projectId: string; redirect?: string | null; gitBranch?: string | null; customEnvironmentId?: string | null; verification?: { type: string; domain: string; value: string }[] };
export type DomainConfig = { misconfigured: boolean; recommendedCNAME?: { rank: number; value: string }[]; recommendedIPv4?: { rank: number; value: string[] }[] };

export function domainDnsRecords(project: ProjectDomain, config: DomainConfig, own: DomainRecord) {
  const records = [own];
  const cname = [...(config.recommendedCNAME ?? [])].sort((a, b) => a.rank - b.rank)[0];
  const ip = [...(config.recommendedIPv4 ?? [])].sort((a, b) => a.rank - b.rank)[0];
  if (project.name !== project.apexName && cname) records.push({ type: "CNAME", name: project.name, value: cname.value, purpose: "Direcionar o agendamento para o Aggenda" });
  else if (ip?.value[0]) records.push({ type: "A", name: project.name, value: ip.value[0], purpose: "Direcionar o agendamento para o Aggenda" });
  for (const item of project.verification ?? []) records.push({ type: item.type, name: item.domain, value: item.value, purpose: "Confirmar o domínio na hospedagem" });
  return records;
}

export function customDomainStatus(owned: boolean, verified: boolean, configured: boolean, https: boolean): DomainState["status"] {
  return !owned || !verified ? "ownership" : !configured ? "dns" : !https ? "https" : "connected";
}

export function publicBookingUrl(organization: { slug: string; customDomain?: string | null; customDomainVerifiedAt?: Date | null }, appUrl: string) {
  return organization.customDomain && organization.customDomainVerifiedAt ? `https://${organization.customDomain}` : new URL(`/agendar/${encodeURIComponent(organization.slug)}`, appUrl).href;
}

export function isPublicIPv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
