import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { normalizeDatabaseUrl } from "../src/lib/database-url";
import { importReferenceCatalog, type ReferenceDatabase } from "../src/lib/reference-catalog";
import { cidSourceUrl, oclBase, parseReferenceCsv } from "../src/lib/reference-sources";
import { syncReferenceCatalog } from "../src/lib/reference-sync";
import { referenceKinds, type ReferenceKind } from "../src/lib/reference-types";
import { resolve } from "node:path";
import { parseTussWorkbook, tissIndexUrl } from "../src/lib/reference-tuss-package";

loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL para executar a rotina de catálogos.");
  const url = new URL(normalizeDatabaseUrl(process.env.DATABASE_URL!));
  url.hostname = url.hostname.replace("-pooler", "");
  const pool = new Pool({ connectionString: url.href, max: 3 });
  const database = drizzle(pool, { schema }) as ReferenceDatabase;
  const lock = await pool.connect();
  try {
    const result = await lock.query("select pg_try_advisory_lock(790079) as acquired");
    if (!result.rows[0].acquired) throw new Error("Já existe uma sincronização de catálogos em execução.");
    const mode = process.argv[2] ?? "sync";
    if (mode === "bootstrap") {
      for (const kind of ["tuss-20", "tuss-22", "cid-10"] as const) {
        const file = kind === "cid-10" ? "public/CID-10-SUBCATEGORIAS.CSV" : `public/${kind}.csv`;
        const bytes = await readFile(file);
        const checksum = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
        const imported = await importReferenceCatalog(database, { kind, entries: parseReferenceCsv(kind, bytes), version: `arquivo-legado-${checksum}`, sourceUrl: kind === "cid-10" ? cidSourceUrl : `${oclBase}/concepts/${kind}`, minimumRows: kind === "tuss-22" ? 5000 : kind === "tuss-20" ? 40000 : 10000 });
        console.log(`${kind}: ${imported.release.rowCount} itens; ${imported.unchanged ? "sem alteração" : "publicado"}. Versão de origem do arquivo legado não comprovada.`);
      }
    } else if (mode === "import") {
      const kind = process.argv[3] as ReferenceKind, file = process.argv[4], version = process.argv[5];
      if (!referenceKinds.includes(kind) || !file || !version) throw new Error("Uso: reference:import -- <catálogo> <arquivo> <versão da fonte>");
      const bytes = await readFile(file);
      const workbookImport = /\.xlsx$/i.test(file) && (kind === "tuss-20" || kind === "tuss-22");
      const sourceUrl = workbookImport ? tissIndexUrl : kind === "cid-10" ? cidSourceUrl : kind === "anvisa-medications" ? "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv" : `${oclBase}/concepts/${kind}`;
      const entries = workbookImport ? await parseTussWorkbook(kind as "tuss-20" | "tuss-22", bytes, version.replace(/^ANS-TISS-/, "")) : parseReferenceCsv(kind, bytes);
      const result = await importReferenceCatalog(database, { kind, entries, version: workbookImport ? `ANS-TISS-${version.replace(/^ANS-TISS-/, "")}` : version, sourceUrl, minimumRows: kind === "tuss-20" ? 40000 : kind === "tuss-22" ? 5000 : 10000 });
      console.log(`${kind}: ${result.release.rowCount} itens; versão ${result.release.version}.`);
    } else if (mode === "sync") {
      const requested = process.argv[3];
      const kinds = requested ? [requested] : ["tuss-22", "tuss-20", "anvisa-medications"];
      const tussSource = process.env.REFERENCE_TUSS_SOURCE ?? "auto";
      if (!["auto", "api", "package"].includes(tussSource)) throw new Error("REFERENCE_TUSS_SOURCE deve ser auto, api ou package.");
      let failed = false;
      for (const kind of kinds) {
        if (!["tuss-20", "tuss-22", "anvisa-medications"].includes(kind)) throw new Error("Catálogo de sincronização inválido. CID-10 exige importação oficial conferida.");
        console.log(`${kind}: consultando fonte oficial…`);
        try {
          const result = await syncReferenceCatalog(database, kind as Exclude<ReferenceKind, "cid-10">, (loaded, total) => { if (loaded % 500 === 0 || loaded === total) console.log(`${kind}: ${loaded}/${total} itens recebidos.`); }, { checkpointDirectory: resolve(process.env.REFERENCE_CACHE_DIR ?? "tmp/reference-catalogs/checkpoints"), tussSource: tussSource as "auto" | "api" | "package" });
          console.log(`${kind}: ${result.release.rowCount} itens; ${result.unchanged ? "sem alteração" : "publicado"}.`);
        } catch (error) { failed = true; console.error(`${kind}: ${error instanceof Error ? error.message : "falha"}. Última versão válida preservada.`); }
      }
      if (failed) process.exitCode = 1;
    } else throw new Error("Operação desconhecida.");
  } finally {
    await lock.query("select pg_advisory_unlock(790079)");
    lock.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha de catálogos"); process.exitCode = 1; });
