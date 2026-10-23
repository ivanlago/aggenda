import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const denied = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) denied.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
denied.addSubnet("2001::", 23, "ipv6");
denied.addSubnet("2001:db8::", 32, "ipv6");
denied.addSubnet("2002::", 16, "ipv6");

export function isPublicPkiAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !denied.check(address, "ipv4") : family === 6 &&
    globalV6.check(address, "ipv6") && !denied.check(address, "ipv6");
}

/** Certificate URLs are untrusted. Pin DNS to checked public addresses, reject
 * redirects, credentials, custom ports, oversized bodies and slow responses. */
export async function downloadPublicPki(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.port || parsed.hash || parsed.href.length > 2048) throw new Error("URL PKI inválida.");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] :
    await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicPkiAddress(item.address))) throw new Error("Destino PKI bloqueado.");
  const target = addresses[0];
  return new Promise((resolve, reject) => {
    const req = (parsed.protocol === "https:" ? httpsRequest : httpRequest)(parsed, {
      agent: false, headers: { Accept: "application/pkix-crl, application/pkix-cert, application/octet-stream" },
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error("Repositório PKI indisponível.")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) { req.destroy(new Error("Resposta PKI excede o limite.")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    const timer = setTimeout(() => req.destroy(new Error("Tempo de consulta PKI excedido.")), 8000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}
