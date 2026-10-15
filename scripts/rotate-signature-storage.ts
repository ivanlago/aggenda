import { loadEnvConfig } from "@next/env";
import { SignatureEncryption } from "../src/lib/signatures/encryption";
import { rotateSignatureStorage } from "../src/lib/signatures/rotate-storage";

async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const organizationId = args.find(arg => arg.startsWith("--organization="))?.slice("--organization=".length);
  if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) ||
    args.filter(arg => arg.startsWith("--organization=")).length !== 1 || args.some(arg => !arg.startsWith("--organization=") && arg !== "--apply")) {
    throw new Error("Informe --organization=<uuid>; adicione --apply apenas para gravar.");
  }
  const keys: unknown = JSON.parse(process.env.SIGNATURE_STORAGE_KEYS || "{}");
  if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.values(keys).some(value => typeof value !== "string")) throw new Error("Configuração inválida.");
  const encryption = new SignatureEncryption(keys as Record<string, string>, process.env.SIGNATURE_STORAGE_ACTIVE_KEY || "v1");
  const { db } = await import("../src/db");
  try {
    console.log(JSON.stringify(await rotateSignatureStorage(db, organizationId, encryption, args.includes("--apply"))));
  } finally { await db.$client.end(); }
}
main().catch(() => {
  console.error("Rotação não concluída. Confira as chaves e a integridade em ambiente isolado. A transação foi revertida em caso de falha; nenhum conteúdo foi exibido.");
  process.exitCode = 1;
});
