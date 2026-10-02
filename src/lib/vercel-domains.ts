import { Resolver } from "node:dns/promises";
import { connect } from "node:tls";
import { customDomainStatus, domainDnsRecords, isPublicIPv4, ownershipRecord, type DomainConfig, type DomainState, type ProjectDomain } from "./custom-domain-rules";

export class DomainProviderError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function domainIntegrationReady() {
  return Boolean(process.env.VERCEL_DOMAINS_TOKEN && process.env.VERCEL_DOMAINS_PROJECT_ID && process.env.BETTER_AUTH_SECRET);
}

export class VercelDomains {
  constructor(private token = process.env.VERCEL_DOMAINS_TOKEN, private projectId = process.env.VERCEL_DOMAINS_PROJECT_ID, private teamId = process.env.VERCEL_DOMAINS_TEAM_ID, private fetcher: typeof fetch = fetch) {}

  private async request<T>(path: string, method = "GET", body?: object): Promise<T> {
    if (!this.token || !this.projectId) throw new DomainProviderError(503, "not_configured", "A conexão de domínios ainda precisa ser ativada pela equipe do Aggenda. O endereço padrão continua disponível.");
    const url = new URL(path, "https://api.vercel.com");
    if (this.teamId) url.searchParams.set("teamId", this.teamId);
    let response: Response;
    try { response = await this.fetcher(url, { method, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(10_000) }); }
    catch { throw new DomainProviderError(503, "unavailable", "A verificação está indisponível no momento. Tente novamente em alguns instantes."); }
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = String(payload?.error?.code ?? "provider_error");
      const message = response.status === 401 || response.status === 403 ? "A integração de domínios precisa ser revisada pela equipe do Aggenda." : response.status === 429 ? "Aguarde alguns instantes antes de verificar novamente." : "Não foi possível configurar este domínio. Confira o endereço e tente novamente.";
      throw new DomainProviderError(response.status, code, message);
    }
    if (!payload) throw new DomainProviderError(502, "invalid_response", "A hospedagem não retornou uma resposta válida. Tente novamente.");
    return payload as T;
  }

  private domainPath(domain: string) { return `/v9/projects/${encodeURIComponent(this.projectId ?? "")}/domains/${encodeURIComponent(domain)}`; }
  async get(domain: string) {
    const project = await this.request<ProjectDomain>(this.domainPath(domain));
    if (project.name !== domain || project.projectId !== this.projectId || project.redirect || project.gitBranch || project.customEnvironmentId) throw new DomainProviderError(409, "domain_conflict", "Este domínio possui outra configuração na hospedagem. Solicite a revisão pela equipe do Aggenda.");
    return project;
  }
  async ensure(domain: string) {
    try { return await this.get(domain); }
    catch (error) { if (!(error instanceof DomainProviderError) || error.status !== 404) throw error; }
    try { await this.request<ProjectDomain>(`/v10/projects/${encodeURIComponent(this.projectId ?? "")}/domains`, "POST", { name: domain }); }
    catch (error) { if (!(error instanceof DomainProviderError) || error.code !== "domain_already_in_use") throw error; }
    return this.get(domain);
  }
  async config(domain: string) {
    return this.request<DomainConfig>(`/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(this.projectId ?? "")}`);
  }
  async verify(domain: string) {
    try { return await this.request<ProjectDomain>(`${this.domainPath(domain)}/verify`, "POST"); }
    catch (error) {
      if (!(error instanceof DomainProviderError) || error.status !== 400 || !["missing_txt_record", "incorrect_txt_record", "conflicting_txt_record"].includes(error.code)) throw error;
      return this.get(domain);
    }
  }
  async remove(domain: string) {
    try { await this.get(domain); await this.request(this.domainPath(domain), "DELETE"); }
    catch (error) { if (!(error instanceof DomainProviderError) || error.status !== 404) throw error; }
  }
}

function resolver() { return new Resolver({ timeout: 3000, tries: 1 }); }
export async function domainOwnershipMatches(record: { name: string; value: string }) {
  try { return (await resolver().resolveTxt(record.name)).some((parts) => parts.join("") === record.value); }
  catch { return false; }
}

export async function domainHttpsReady(domain: string) {
  let addresses: string[];
  try { addresses = await resolver().resolve4(domain); } catch { return false; }
  if (!addresses.length || addresses.some((ip) => !isPublicIPv4(ip))) return false;
  return new Promise<boolean>((resolve) => {
    // Pin the resolved public IP while validating the certificate for the domain.
    const socket = connect({ host: addresses[0], port: 443, servername: domain, rejectUnauthorized: true });
    const finish = (ready: boolean) => { clearTimeout(timer); socket.destroy(); resolve(ready); };
    const timer = setTimeout(() => finish(false), 8000);
    socket.once("secureConnect", () => finish(socket.authorized));
    socket.once("error", () => finish(false));
  });
}

export async function inspectCustomDomain(organizationId: string, domain: string, verifiedAt: Date | null, verify = false, provider = new VercelDomains()): Promise<DomainState> {
  const own = ownershipRecord(organizationId, domain, process.env.BETTER_AUTH_SECRET ?? "");
  const project = await provider.get(domain);
  const config = await provider.config(domain);
  const owned = await domainOwnershipMatches(own);
  if (verify && owned && !project.verified) await provider.verify(domain);
  const verifiedProject = verify && owned && !project.verified ? await provider.get(domain) : project;
  const https = verify && owned && verifiedProject.verified && config.misconfigured === false ? await domainHttpsReady(domain) : Boolean(verifiedAt);
  return { domain, status: customDomainStatus(owned, verifiedProject.verified === true, config.misconfigured === false, https), records: domainDnsRecords(verifiedProject, config, own) };
}
