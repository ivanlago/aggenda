import type { ReferenceDatabase } from "./reference-catalog";
import { importReferenceCatalog } from "./reference-catalog";
import { downloadReferenceCatalog } from "./reference-sources";
import { referenceSyncRuns } from "@/db/reference-schema";
import type { ReferenceKind } from "./reference-types";
import { eq } from "drizzle-orm";

export async function syncReferenceCatalog(database: ReferenceDatabase, kind: Exclude<ReferenceKind, "cid-10">, onProgress?: (loaded: number, total: number) => void) {
  let downloaded: Awaited<ReturnType<typeof downloadReferenceCatalog>>;
  const startedAt = new Date();
  const [run] = await database.insert(referenceSyncRuns).values({ kind, startedAt, status: "running" }).returning();
  try { downloaded = await downloadReferenceCatalog(kind, onProgress); }
  catch (error) {
    await database.update(referenceSyncRuns).set({ finishedAt: new Date(), status: "failed", message: error instanceof Error ? error.message.slice(0, 500) : "Falha ao baixar fonte oficial" }).where(eq(referenceSyncRuns.id, run.id));
    throw error;
  }
  return importReferenceCatalog(database, { kind, ...downloaded, runId: run.id, version: downloaded.sourceModifiedAt ?? `snapshot-${new Date().toISOString()}` });
}
