import assert from "node:assert/strict";
import test from "node:test";
import { customDomainStatus, domainDnsRecords, isPublicIPv4, normalizeCustomDomain, ownershipRecord, publicBookingUrl, type ProjectDomain } from "../src/lib/custom-domain-rules";
import { DomainProviderError, VercelDomains } from "../src/lib/vercel-domains";

const project: ProjectDomain = { name: "agenda.clinica.com.br", apexName: "clinica.com.br", projectId: "prj_test", verified: false };
const own = ownershipRecord("org-one", project.name, "test-secret");

test("normaliza domínio e rejeita caminhos, IPs, portas e domínios reservados", () => {
  assert.equal(normalizeCustomDomain(" HTTPS://Agenda.Clinica.com.br/ "), project.name);
  assert.equal(normalizeCustomDomain("agenda.clínica.com.br"), "agenda.xn--clnica-4va.com.br");
  for (const domain of ["localhost", "127.0.0.1", "https://clinic.com/path", "user@clinic.com", "clinic.com:3000", "clinic.com?x=1", "*.clinic.com", "test.local", "app.vercel.app", "www.aggenda.app.br", "-clinic.com"]) assert.throws(() => normalizeCustomDomain(domain));
  assert.throws(() => normalizeCustomDomain("booking.platform.com", "https://www.platform.com"));
});
test("desafio de propriedade difere por clínica e domínio", () => {
  assert.deepEqual(own, ownershipRecord("org-one", project.name, "test-secret"));
  assert.notEqual(own.value, ownershipRecord("org-two", project.name, "test-secret").value);
  assert.notEqual(own.value, ownershipRecord("org-one", "other.clinica.com.br", "test-secret").value);
});
test("usa recomendações atuais de CNAME/A e inclui TXT da hospedagem", () => {
  const records = domainDnsRecords({ ...project, verification: [{ type: "TXT", domain: "_vercel.clinica.com.br", value: "challenge" }] }, { misconfigured: true, recommendedCNAME: [{ rank: 2, value: "old.vercel-dns.com" }, { rank: 1, value: "new.vercel-dns.com" }], recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }] }, own);
  assert.equal(records[1].type, "CNAME"); assert.equal(records[1].value, "new.vercel-dns.com"); assert.equal(records[2].value, "challenge");
  const apex = domainDnsRecords({ ...project, name: project.apexName }, { misconfigured: false, recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }] }, own);
  assert.equal(apex[1].type, "A");
});
test("conecta somente com propriedade, DNS e HTTPS confirmados", () => {
  assert.equal(customDomainStatus(false, true, true, true), "ownership");
  assert.equal(customDomainStatus(true, false, true, true), "ownership");
  assert.equal(customDomainStatus(true, true, false, true), "dns");
  assert.equal(customDomainStatus(true, true, true, false), "https");
  assert.equal(customDomainStatus(true, true, true, true), "connected");
  assert.equal(publicBookingUrl({ slug: "aura", customDomain: project.name }, "https://www.aggenda.app.br"), "https://www.aggenda.app.br/agendar/aura");
  assert.equal(publicBookingUrl({ slug: "aura", customDomain: project.name, customDomainVerifiedAt: new Date() }, "https://www.aggenda.app.br"), "https://agenda.clinica.com.br");
});
test("a verificação HTTPS bloqueia redes privadas e especiais", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "203.0.113.1", "::1"]) assert.equal(isPublicIPv4(ip), false, ip);
  assert.equal(isPublicIPv4("76.76.21.21"), true);
});

function json(data: object, status = 200) { return new Response(JSON.stringify(data), { status }); }
test("cadastro idempotente: consulta antes de adicionar e envia equipe/token apenas à Vercel", async () => {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const provider = new VercelDomains("secret", "prj_test", "team_test", async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    assert.equal(url.origin, "https://api.vercel.com"); assert.equal(url.searchParams.get("teamId"), "team_test");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
    return calls.length === 1 ? json({ error: { code: "not_found" } }, 404) : json(project);
  });
  assert.deepEqual(await provider.ensure(project.name), project);
  assert.equal(calls.length, 3); assert.equal(calls[1].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { name: project.name });
  assert.equal(calls[1].url.pathname, "/v10/projects/prj_test/domains");
});
test("domínio existente não é adicionado novamente ou transferido", async () => {
  const methods: string[] = [];
  const provider = new VercelDomains("secret", "prj_test", undefined, async (_input, init) => { methods.push(init!.method!); return json(project); });
  await provider.ensure(project.name); assert.deepEqual(methods, ["GET"]);
  const conflict = new VercelDomains("secret", "prj_test", undefined, async () => json({ ...project, projectId: "prj_other" }));
  await assert.rejects(conflict.ensure(project.name), /outra configuração/);
  const redirected = new VercelDomains("secret", "prj_test", undefined, async () => json({ ...project, redirect: "other.com" }));
  await assert.rejects(redirected.remove(project.name), /outra configuração/);
});
test("falhas de credencial, JSON vazio e indisponibilidade produzem erros seguros", async () => {
  for (const response of [new Response("", { status: 502 }), json({ error: { code: "forbidden", message: "sensitive-provider-text" } }, 403), new Response("", { status: 200 })]) {
    const provider = new VercelDomains("secret", "prj_test", undefined, async () => response);
    await assert.rejects(provider.get(project.name), (error: unknown) => error instanceof DomainProviderError && !error.message.includes("sensitive-provider-text"));
  }
  const missing = new VercelDomains("", "prj_test", undefined, async () => { throw new Error("must not call"); });
  await assert.rejects(missing.ensure(project.name), /ativada/);
});
test("remoção afeta apenas o domínio confirmado no projeto atual", async () => {
  const methods: string[] = [];
  const provider = new VercelDomains("secret", "prj_test", undefined, async (_url, init) => { methods.push(init!.method!); return init!.method === "DELETE" ? new Response(null, { status: 204 }) : json(project); });
  await provider.remove(project.name); assert.deepEqual(methods, ["GET", "DELETE"]);
});
