import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { referenceReleases, referenceSyncRuns } from "@/db/reference-schema";
import { referenceKinds } from "@/lib/reference-types";

const labels = { "tuss-20": "Medicamentos — TUSS 20", "tuss-22": "Exames e procedimentos — TUSS 22", "cid-10": "Diagnósticos — CID-10", "anvisa-medications": "Medicamentos — Anvisa" };
const formatDate = (date: Date) => date.toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });
export async function ReferenceCatalogStatus() {
  const [releases, runs] = await Promise.all([
    db.select().from(referenceReleases).where(eq(referenceReleases.active, true)),
    db.selectDistinctOn([referenceSyncRuns.kind], { kind: referenceSyncRuns.kind, status: referenceSyncRuns.status, startedAt: referenceSyncRuns.startedAt, stale: sql<boolean>`${referenceSyncRuns.startedAt} < now() - interval '6 hours'` }).from(referenceSyncRuns).orderBy(referenceSyncRuns.kind, desc(referenceSyncRuns.startedAt)),
  ]);
  return <section className="panel max-w-4xl">
    <h2 className="text-xl font-extrabold">Catálogos de referência</h2>
    <p className="mt-2 text-sm text-muted">Bases compartilhadas de códigos e descrições. Atualizações preservam os documentos já emitidos. Falhas de atualização mantêm a última versão válida.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{referenceKinds.map(kind => {
      const release = releases.find(item => item.kind === kind), run = runs.find(item => item.kind === kind);
      return <article className="rounded-xl border p-4" key={kind}>
        <h3 className="font-bold">{labels[kind]}</h3>
        {release ? <><p className="mt-2 text-sm">{release.rowCount.toLocaleString("pt-BR")} registros · importado em {formatDate(release.importedAt)}</p><p className="mt-1 break-words text-xs text-muted">Versão: {release.version}</p>{release.version.startsWith("arquivo-legado-") && <p className="mt-2 text-xs text-amber-800">Arquivo anterior incorporado ao banco. A versão oficial de origem ainda precisa ser confirmada.</p>}<a className="mt-2 inline-block text-sm text-brand underline" href={release.sourceUrl} target="_blank" rel="noopener noreferrer">Fonte do catálogo</a></> : <p className="mt-2 text-sm text-amber-800">Ainda não importado.</p>}
        {run && <p className={`mt-2 text-xs ${run.status === "failed" ? "text-amber-800" : "text-muted"}`}>Última tentativa: {formatDate(run.startedAt)} · {run.status === "running" && run.stale ? "Sem conclusão registrada; confira a rotina de atualização" : ({ running: "Em andamento", success: "Atualizado", unchanged: "Sem alterações", failed: "Falhou; versão anterior preservada" } as Record<string, string>)[run.status]}</p>}
        {kind === "cid-10" && <p className="mt-2 text-xs text-muted">Atualização por importação de edição oficial conferida; não há troca automática de classificação.</p>}
      </article>;
    })}</div>
  </section>;
}
