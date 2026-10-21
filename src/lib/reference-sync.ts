import type { ReferenceDatabase } from "./reference-catalog";
import { importReferenceCatalog } from "./reference-catalog";
import { downloadReferenceCatalog } from "./reference-sources";
import { referenceSyncRuns } from "@/db/reference-schema";
import type { ReferenceKind } from "./reference-types";
import { eq } from "drizzle-orm";
import { downloadTussPackage } from "./reference-tuss-package";

export async function syncReferenceCatalog(database: ReferenceDatabase, kind: Exclude<ReferenceKind, "cid-10">, onProgress?: (loaded: number, total: number) => void, options: { checkpointDirectory?: string; tussSource?: "auto" | "api" | "package" } = {}) {
  let downloaded: Awaited<ReturnType<typeof downloadReferenceCatalog>> & { version?: string };
  const startedAt = new Date();
  const [run] = await database.insert(referenceSyncRuns).values({ kind, startedAt, status: "running" }).returning();
  async function fromApi() {
    try { return await downloadReferenceCatalog(kind, onProgress, options); }
    catch (error) {
      if (kind === "anvisa-medications" || !options.checkpointDirectory || !(error instanceof TypeError || error instanceof Error && (/Timeout|Abort/.test(error.name) || /HTTP (429|5\d\d)/.test(error.message)))) throw error;
      console.warn(`${kind}: falha transitória; retomando páginas já recebidas.`);
      return downloadReferenceCatalog(kind, onProgress, options);
    }
  }
  try {
    if (kind !== "anvisa-medications" && options.tussSource !== "api") {
      try { downloaded = await downloadTussPackage(kind); }
      catch (error) {
        if (options.tussSource === "package") throw error;
        console.warn(`${kind}: pacote ANS indisponível (${error instanceof Error ? error.message : "falha"}); usando API com retomada.`);
        downloaded = await fromApi();
      }
    } else downloaded = await fromApi();
  }
  catch (error) {
    await database.update(referenceSyncRuns).set({ finishedAt: new Date(), status: "failed", message: error instanceof Error ? error.message.slice(0, 500) : "Falha ao baixar fonte oficial" }).where(eq(referenceSyncRuns.id, run.id));
    throw error;
  }
  return importReferenceCatalog(database, { kind, ...downloaded, runId: run.id, version: downloaded.version ?? downloaded.sourceModifiedAt ?? `snapshot-${new Date().toISOString()}` });
}
