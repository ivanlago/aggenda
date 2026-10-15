import { loadEnvConfig } from "@next/env";
import { nfseVault } from "../src/lib/nfse/vault";
import { migrateNfseCustody } from "../src/lib/nfse/custody-migration";

async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const organizationId = args.find((arg) => arg.startsWith("--organization="))?.slice("--organization=".length);
  if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) || args.some((arg) => !arg.startsWith("--organization=") && arg !== "--apply")) {
    throw new Error("Uso: tsx scripts/migrate-nfse-custody.ts --organization=<uuid> [--apply]. Sem --apply: somente conferência.");
  }
  const vault = nfseVault();
  const { db } = await import("../src/db");
  try {
    const result = await migrateNfseCustody(db, organizationId, vault, args.includes("--apply"));
    console.log(JSON.stringify(result));
  } finally {
    await db.$client.end();
  }
}
main().catch(() => {
  console.error("Migração fiscal não concluída. Confira configuração, organização e chaves antigas. Nenhuma credencial foi exibida. Alterações da transação foram revertidas em caso de falha.");
  process.exitCode = 1;
});
