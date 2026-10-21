import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { db } from "@/db";
import { referenceEntries, referenceReleases, referenceSyncRuns } from "@/db/reference-schema";
import { normalizeReference, referenceDate, referenceSearchText, type CatalogReference, type ReferenceEntry, type ReferenceKind } from "./reference-types";

export type ReferenceDatabase = typeof db;
export class ReferenceUnavailable extends Error {}
export function validateReferenceEntries(entries: ReferenceEntry[]) {
  if (!entries.length) throw new Error("Catálogo vazio; versão anterior preservada.");
  const codes = new Set<string>();
  return entries.map(entry => {
    const code = entry.code.trim(), name = entry.name.trim();
    if (!code || code.length > 100 || !name || name.length > 2000 || name.includes("\uFFFD")) throw new Error("Código ou descrição inválidos no catálogo.");
    if (codes.has(code)) throw new Error(`Código duplicado no catálogo: ${code}`);
    codes.add(code);
    const validFrom = referenceDate(entry.validFrom), validUntil = referenceDate(entry.validUntil);
    if (validFrom && validUntil && validFrom > validUntil) throw new Error(`Vigência inconsistente: ${code}`);
    return { ...entry, code, name, validFrom, validUntil, normalizedCode: normalizeReference(code).replaceAll(" ", ""), searchText: referenceSearchText(entry) };
  });
}

export async function importReferenceCatalog(database: ReferenceDatabase, input: {
  kind: ReferenceKind; sourceUrl: string; version: string; sourceModifiedAt?: string | null; entries: ReferenceEntry[];
  minimumRows?: number; runId?: string;
}) {
  const run = input.runId ? { id: input.runId } : (await database.insert(referenceSyncRuns).values({ kind: input.kind, status: "running" }).returning())[0];
  try {
    const entries = validateReferenceEntries(input.entries).sort((a, b) => a.code.localeCompare(b.code, "en"));
    if (entries.length < (input.minimumRows ?? 1)) throw new Error("Catálogo incompleto; versão anterior preservada.");
    // Semantic checksum: changing CSV order or import time must not create another release.
    const checksum = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
    const result = await database.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`reference:${input.kind}`}))`);
      const [current] = await tx.select().from(referenceReleases).where(and(eq(referenceReleases.kind, input.kind), eq(referenceReleases.active, true)));
      const [known] = await tx.select().from(referenceReleases).where(and(eq(referenceReleases.kind, input.kind), eq(referenceReleases.checksum, checksum)));
      if (known && known.id === current?.id) return { release: known, unchanged: true };
      if (known) throw new Error("A fonte retornou uma versão antiga; restauração exige conferência explícita.");
      if (/^ANS-TISS-\d{6}$/.test(current?.version ?? "") && /^ANS-TISS-\d{6}$/.test(input.version) && input.version < current!.version) throw new Error("A fonte retornou uma edição TISS anterior ao catálogo publicado.");
      if (current && input.version.startsWith("arquivo-legado-") && !current.version.startsWith("arquivo-legado-")) throw new Error("O bootstrap não pode substituir uma versão sincronizada da fonte oficial.");
      if (current?.sourceModifiedAt && input.sourceModifiedAt && Date.parse(input.sourceModifiedAt) < Date.parse(current.sourceModifiedAt)) throw new Error("A fonte retornou um arquivo anterior ao catálogo publicado.");
      if (current && entries.length < current.rowCount * .9) throw new Error("Redução superior a 10% do catálogo; publicação bloqueada para conferência.");
      const [release] = await tx.insert(referenceReleases).values({ kind: input.kind, sourceUrl: input.sourceUrl, version: input.version, sourceModifiedAt: input.sourceModifiedAt, checksum, rowCount: entries.length }).returning();
      for (let offset = 0; offset < entries.length; offset += 500) {
        await tx.insert(referenceEntries).values(entries.slice(offset, offset + 500).map(entry => ({ ...entry, releaseId: release.id })));
      }
      await tx.update(referenceReleases).set({ active: false }).where(and(eq(referenceReleases.kind, input.kind), eq(referenceReleases.active, true)));
      await tx.update(referenceReleases).set({ active: true }).where(eq(referenceReleases.id, release.id));
      return { release: { ...release, active: true }, unchanged: false };
    });
    await database.update(referenceSyncRuns).set({ status: result.unchanged ? "unchanged" : "success", releaseId: result.release.id, finishedAt: new Date() }).where(eq(referenceSyncRuns.id, run.id));
    return result;
  } catch (error) {
    await database.update(referenceSyncRuns).set({ status: "failed", finishedAt: new Date(), message: error instanceof Error ? error.message.slice(0, 500) : "Falha na importação" }).where(eq(referenceSyncRuns.id, run.id));
    throw error;
  }
}

export async function searchReferenceCatalog(database: ReferenceDatabase, kind: ReferenceKind, query: string, options: { page?: number; limit?: number; includeInactive?: boolean; today?: string } = {}) {
  const [release] = await database.select().from(referenceReleases).where(and(eq(referenceReleases.kind, kind), eq(referenceReleases.active, true)));
  if (!release) throw new ReferenceUnavailable("Catálogo ainda não importado.");
  const page = Math.max(1, Math.min(200, Math.trunc(options.page || 1)));
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 30)));
  const needle = normalizeReference(query.slice(0, 120));
  const metadata = { releaseId: release.id, version: release.version, sourceUrl: release.sourceUrl, importedAt: release.importedAt.toISOString(), sourceModifiedAt: release.sourceModifiedAt };
  if (needle.length < 2) return { items: [], page, hasMore: false, catalog: metadata };
  const today = options.today ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bahia" }).format(new Date());
  const tsquery = needle.split(/\s+/).map(token => `${token}:*`).join(" & ");
  const code = needle.replaceAll(" ", "");
  const aliasPrefix = needle.includes("ressonancia magnetica") ? "rm -%" : needle.includes("tomografia computadorizada") ? "tc -%" : needle.includes("radiografia") || needle === "raio x" || needle === "raios x" ? "rx -%" : needle.includes("ultrassom") || needle.includes("ultrassonografia") ? "us -%" : null;
  const eligible = sql<boolean>`${referenceEntries.active} and (${referenceEntries.validFrom} is null or ${referenceEntries.validFrom} <= ${today}::date) and (${referenceEntries.validUntil} is null or ${referenceEntries.validUntil} >= ${today}::date)`;
  const rows = await database.select().from(referenceEntries).where(and(
    eq(referenceEntries.releaseId, release.id), options.includeInactive ? undefined : eligible,
    sql`(${referenceEntries.normalizedCode} like ${`${code}%`} or to_tsvector('simple', ${referenceEntries.searchText}) @@ to_tsquery('simple', ${tsquery}))`,
  )).orderBy(desc(sql`${referenceEntries.normalizedCode} = ${code}`), desc(eligible), desc(sql`lower(trim(${referenceEntries.name})) = ${query.trim().toLocaleLowerCase("pt-BR")}`), ...(aliasPrefix ? [desc(sql`lower(${referenceEntries.name}) like ${aliasPrefix}`)] : []), desc(sql`ts_rank(to_tsvector('simple', ${referenceEntries.searchText}), to_tsquery('simple', ${tsquery}))`), asc(referenceEntries.name), asc(referenceEntries.code)).limit(limit + 1).offset((page - 1) * limit);
  return { items: rows.slice(0, limit).map(row => ({ ...row, eligible: row.active && (!row.validFrom || row.validFrom <= today) && (!row.validUntil || row.validUntil >= today), reference: { kind, releaseId: release.id, version: release.version, code: row.code, name: row.name } satisfies CatalogReference })), page, hasMore: rows.length > limit, catalog: metadata };
}

/** Resolve an immutable release, never silently replace an earlier selection with today's name. */
export async function resolveCatalogReference(database: ReferenceDatabase, value: CatalogReference, eligibleOn?: string) {
  const [row] = await database.select({ entry: referenceEntries, release: referenceReleases }).from(referenceEntries).innerJoin(referenceReleases, eq(referenceEntries.releaseId, referenceReleases.id)).where(and(eq(referenceEntries.releaseId, value.releaseId), eq(referenceReleases.kind, value.kind), eq(referenceEntries.code, value.code))).limit(1);
  if (!row) throw new Error("Referência de catálogo não encontrada. Selecione novamente.");
  if (eligibleOn) {
    const [current] = await database.select({ entry: referenceEntries }).from(referenceEntries).innerJoin(referenceReleases, eq(referenceEntries.releaseId, referenceReleases.id)).where(and(eq(referenceReleases.kind, value.kind), eq(referenceReleases.active, true), eq(referenceEntries.code, value.code))).limit(1);
    if (!current || !current.entry.active || current.entry.validFrom && current.entry.validFrom > eligibleOn || current.entry.validUntil && current.entry.validUntil < eligibleOn) throw new Error("Código fora de vigência ou inativo. Revise a seleção antes de emitir.");
  }
  return { kind: row.release.kind, releaseId: row.release.id, version: row.release.version, code: row.entry.code, name: row.entry.name } satisfies CatalogReference;
}
