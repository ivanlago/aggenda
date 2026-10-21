import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/reference-schema";
import { importReferenceCatalog, resolveCatalogReference, searchReferenceCatalog, validateReferenceEntries, type ReferenceDatabase } from "../src/lib/reference-catalog";
import { downloadReferenceCatalog, parseReferenceCsv } from "../src/lib/reference-sources";
import { snapshotDocumentReferences } from "../src/lib/reference-snapshots";
import type { ReferenceEntry } from "../src/lib/reference-types";

test("legacy source files parse without dropping quoted records; invalid schemas/dates reject", async () => {
  for (const [kind, expected] of [["tuss-20", 43376], ["tuss-22", 5966]] as const) {
    const entries = parseReferenceCsv(kind, await readFile(`public/${kind}.csv`));
    assert.equal(entries.length, expected);
    assert.equal(validateReferenceEntries(entries).length, expected);
  }
  const cid = parseReferenceCsv("cid-10", await readFile("public/CID-10-SUBCATEGORIAS.CSV"));
  assert.ok(cid.length > 10000);
  assert.equal(validateReferenceEntries(cid).length, cid.length);
  assert.throws(() => parseReferenceCsv("tuss-22", Buffer.from("id;name\n1;fake")), /Formato/);
  assert.throws(() => validateReferenceEntries([{ code: "1", name: "x", validFrom: "2026-02-30" }]), /Data/);
});

test("Anvisa collapses identical rows and quarantines conflicting registrations without assigning a TUSS code", () => {
  const header = "NOME_PRODUTO;NUMERO_REGISTRO_PRODUTO;NUMERO_PROCESSO;EMPRESA_DETENTORA_REGISTRO;SITUACAO_REGISTRO;PRINCIPIO_ATIVO\n";
  const row = "Exemplo;123;456;Laboratorio;Ativo;Substancia\n";
  assert.equal(parseReferenceCsv("anvisa-medications", Buffer.from(header + row + row)).length, 1);
  const conflict = parseReferenceCsv("anvisa-medications", Buffer.from(header + row + row.replace("Ativo", "Inativo")));
  assert.equal(conflict.length, 1);
  assert.equal(conflict[0].code, "registro:123");
  assert.equal(conflict[0].active, false);
  assert.match(conflict[0].registrationStatus!, /Divergente/);
});

test("official TUSS download retries transient failures and checks every page against the announced count", async () => {
  const originalFetch = globalThis.fetch;
  let secondPageCalls = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/source")) return Response.json([{ Codigo: "tuss-22", Total_sources: 1000 }]);
    const page = Number(url.searchParams.get("page"));
    if (page === 2 && ++secondPageCalls === 1) throw new TypeError("Transient network failure");
    return Response.json(Array.from({ length: 25 }, (_, index) => ({ id: String((page - 1) * 25 + index), source: "tuss-22", display_name: `Exame ${page}-${index}`, extras: { inicio_vigencia: "2026-01-01", fim_vigencia: "-" } })));
  };
  try {
    const result = await downloadReferenceCatalog("tuss-22");
    assert.equal(result.entries.length, 1000);
    assert.equal(secondPageCalls, 2);
    assert.equal(result.minimumRows, 1000);
  } finally { globalThis.fetch = originalFetch; }
});

test("real migration, atomic publication, indexed search, inclusive validity, pagination and immutable document snapshots", async () => {
  const pg = new PGlite();
  const database = drizzle(pg, { schema }) as unknown as ReferenceDatabase;
  try {
    await pg.exec("create table services (id uuid primary key default gen_random_uuid());");
    await pg.exec(await readFile("drizzle/0079_reference_catalogs.sql", "utf8"));
    const entries: ReferenceEntry[] = [
      { code: "100", name: "RM - Crânio", validFrom: "2026-01-01" },
      { code: "101", name: "Tomografia de crânio", validUntil: "2026-10-21" },
      { code: "102", name: "Crânio vencido", validUntil: "2026-10-20" },
      { code: "103", name: "Crânio futuro", validFrom: "2026-10-22" },
      { code: "104", name: "Crânio inativo", active: false },
    ];
    const input = { kind: "tuss-22" as const, sourceUrl: "https://official.test/tuss", version: "ANS-TISS-202609", entries };
    const first = await importReferenceCatalog(database, input);
    assert.equal(first.unchanged, false);
    assert.equal((await importReferenceCatalog(database, { ...input, entries: [...entries].reverse() })).unchanged, true);
    const options = { today: "2026-10-21" };
    const matches = await searchReferenceCatalog(database, "tuss-22", "cranio", options);
    assert.deepEqual(matches.items.map(item => item.code).sort(), ["100", "101"]);
    assert.equal((await searchReferenceCatalog(database, "tuss-22", "ressonância magnética", options)).items[0].code, "100");
    assert.equal((await searchReferenceCatalog(database, "tuss-22", "10", { ...options, limit: 1 })).hasMore, true);
    assert.equal((await searchReferenceCatalog(database, "tuss-22", "10", { ...options, limit: 1, page: 2 })).items[0].code, "101");
    const history = await searchReferenceCatalog(database, "tuss-22", "cranio", { ...options, includeInactive: true });
    assert.equal(history.items.length, 5);
    assert.equal(history.items.filter(item => item.eligible).length, 2);
    assert.equal((await searchReferenceCatalog(database, "tuss-22", "%' | !", options)).items.length, 0);
    await assert.rejects(importReferenceCatalog(database, { ...input, entries: [] }), /vazio/);
    await assert.rejects(importReferenceCatalog(database, { ...input, entries: [entries[0], entries[0]] }), /duplicado/);
    await assert.rejects(importReferenceCatalog(database, { ...input, entries: entries.slice(0, 2) }), /Redução/);
    assert.equal((await searchReferenceCatalog(database, "tuss-22", "100", options)).catalog.releaseId, first.release.id);
    const reference = matches.items.find(item => item.code === "100")!.reference;
    const second = await importReferenceCatalog(database, { ...input, version: "ANS-TISS-202610", entries: entries.map(entry => entry.code === "100" ? { ...entry, name: "RM - Crânio revisada" } : entry) });
    assert.notEqual(second.release.id, first.release.id);
    assert.equal((await resolveCatalogReference(database, reference)).name, "RM - Crânio");
    const snapshot = await snapshotDocumentReferences(database, { exams: [{ catalogReference: { ...reference, name: "forged" } }] }, options.today);
    assert.equal((snapshot?.exams as Array<{ catalogReference: { name: string } }>)[0].catalogReference.name, "RM - Crânio");
    await assert.rejects(snapshotDocumentReferences(database, { cid: { reference: history.items.find(item => item.code === "102")!.reference } }, options.today), /fora de vigência/);
    await assert.rejects(importReferenceCatalog(database, input), /antiga/);
    await assert.rejects(importReferenceCatalog(database, { ...input, version: "ANS-TISS-202608", entries: entries.map(entry => ({ ...entry, name: `${entry.name} antiga` })) }), /edição TISS anterior/);
    const active = await database.select().from(schema.referenceReleases).where(eq(schema.referenceReleases.active, true));
    assert.equal(active.length, 1);
    const runs = await database.select().from(schema.referenceSyncRuns).where(eq(schema.referenceSyncRuns.status, "failed"));
    assert.equal(runs.length, 5);
    const meds = [{ code: "registro:123", name: "Exemplo", substance: "substância", laboratory: "Laboratório", registrationStatus: "Ativo", active: true }, { code: "registro:124", name: "Outro + Exemplo", active: true }];
    await importReferenceCatalog(database, { kind: "anvisa-medications", sourceUrl: "https://official.test/anvisa", version: "v1", entries: meds });
    assert.equal((await searchReferenceCatalog(database, "anvisa-medications", "substancia laboratorio", options)).items[0].code, "registro:123");
    assert.equal((await searchReferenceCatalog(database, "anvisa-medications", "Exemplo", options)).items[0].code, "registro:123");
    assert.equal((await searchReferenceCatalog(database, "tuss-22", "substancia", options)).items.length, 0);
  } finally { await pg.close(); }
});
