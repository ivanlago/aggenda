import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Workbook } from "exceljs";
import JSZip from "jszip";
import { downloadReferenceCatalog } from "../src/lib/reference-sources";
import { checkpointHash, ReferenceCheckpoint } from "../src/lib/reference-checkpoint";
import { findTissPackage, findTissRelease, parseTussWorkbook, tissIndexUrl } from "../src/lib/reference-tuss-package";
import { readOfficialZip } from "../src/lib/reference-zip";

test("API resumes successful pages after a partial batch failure and removes completed scratch data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aggenda-reference-"));
  const original = globalThis.fetch, calls = new Map<number, number>(); let fail = true, changed = false;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/source")) return Response.json([{ Codigo: "tuss-22", Total_sources: 1000 }]);
    const page = Number(url.searchParams.get("page")); calls.set(page, (calls.get(page) ?? 0) + 1);
    if (page === 6 && fail) throw new TypeError("Temporary network failure");
    return Response.json(Array.from({ length: 25 }, (_, i) => ({ id: String((page - 1) * 25 + i), source: "tuss-22", display_name: `${changed ? "Revisado " : ""}Exame ${page}-${i}` })));
  };
  try {
    await assert.rejects(downloadReferenceCatalog("tuss-22", undefined, { checkpointDirectory: directory }), /Temporary/);
    assert.equal(calls.get(6), 3);
    assert.ok((await readdir(directory)).length >= 7);
    fail = false;
    const result = await downloadReferenceCatalog("tuss-22", undefined, { checkpointDirectory: directory });
    assert.equal(result.entries.length, 1000);
    for (const page of [2, 3, 4, 5, 7, 8]) assert.equal(calls.get(page), 1, `page ${page} should be reused`);
    assert.equal(calls.get(1), 2, "first-page anchor must be checked on every attempt");
    assert.deepEqual(await readdir(directory), []);
    fail = true;
    await assert.rejects(downloadReferenceCatalog("tuss-22", undefined, { checkpointDirectory: directory }), /Temporary/);
    const previousCalls = calls.get(2)!;
    changed = true; fail = false;
    await downloadReferenceCatalog("tuss-22", undefined, { checkpointDirectory: directory });
    assert.equal(calls.get(2), previousCalls + 1, "a changed first-page anchor must invalidate earlier pages");
  } finally { globalThis.fetch = original; await rm(directory, { recursive: true, force: true }); }
});

test("checkpoints reject corruption, expiry and a changed source identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aggenda-checkpoint-"));
  const store = new ReferenceCheckpoint(directory, checkpointHash({ version: 1 }));
  try {
    await store.write(1, [{ id: "1" }]);
    assert.deepEqual(await store.read(1), [{ id: "1" }]);
    assert.equal(await new ReferenceCheckpoint(directory, checkpointHash({ version: 2 })).read(1), undefined);
    const path = join(directory, (await readdir(directory))[0]), saved = JSON.parse(await readFile(path, "utf8"));
    saved.rows[0].id = "tampered";
    await writeFile(path, JSON.stringify(saved)); assert.equal(await store.read(1), undefined);
    await store.write(1, [{ id: "1" }]);
    const expired = JSON.parse(await readFile(path, "utf8")); expired.savedAt -= 7 * 3600 * 1000;
    await writeFile(path, JSON.stringify(expired)); assert.equal(await store.read(1), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("official edition discovery rejects unrelated hosts and ambiguous packages", () => {
  assert.match(findTissRelease('<a href="/ans/padrao-tiss-agosto-2026">old</a><a href="/ans/padrao-tiss-setembro-2026">current</a>'), /setembro-2026$/);
  assert.throws(() => findTissRelease('<a href="https://untrusted.test/padrao-tiss-setembro-2026">x</a>'), /domínios/);
  const zip = "https://www.ans.gov.br/arquivos/extras/tiss/Padrao_TISS_Representacao_de_Conceitos_em_Saude_202609.zip";
  assert.equal(findTissPackage(`<a href="${zip}">TUSS</a>`, tissIndexUrl), zip);
  assert.throws(() => findTissPackage(`<a href="${zip}">x</a><a href="${zip.replace("202609", "202608")}">y</a>`, tissIndexUrl), /ambíguo/);
});

test("official workbook preserves presentations, codes and inclusive dates; rejects wrong table/edition/schema", async () => {
  const workbook = new Workbook(), sheet = workbook.addWorksheet("TAB MEDICAMENTOS 202609");
  sheet.addRow(["Tabela 20 - Terminologia de Medicamentos"]);
  sheet.addRow(["Código do Termo", "Termo", "Apresentação", "Laboratório", "Data de início de vigência", "Data de fim de vigência"]);
  sheet.addRow([90035593, "ORENCIA", "250 MG", "Laboratório", new Date("2026-10-01T00:00:00Z"), new Date("2026-10-31T00:00:00Z")]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const [row] = await parseTussWorkbook("tuss-20", bytes, "202609");
  assert.deepEqual(row, { code: "90035593", name: "ORENCIA", presentation: "250 MG", laboratory: "Laboratório", validFrom: "2026-10-01", validUntil: "2026-10-31", active: true });
  await assert.rejects(parseTussWorkbook("tuss-22", bytes, "202609"), /cabeçalhos/);
  await assert.rejects(parseTussWorkbook("tuss-20", bytes, "202608"), /edição/);
  sheet.getCell("A3").value = { formula: "1+1", result: 90035593 };
  await assert.rejects(parseTussWorkbook("tuss-20", new Uint8Array(await workbook.xlsx.writeBuffer()), "202609"), /fórmulas/);
});

test("range ZIP reads only the target workbook, checks ETag, byte ranges and CRC, rejects whole-file responses", async () => {
  const archive = new JSZip(); archive.file("unrelated.bin", randomBytes(1_000_000)); archive.file("TUSS 22 - VERSAO 202609.xlsx", "official workbook bytes");
  const bytes = await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const original = globalThis.fetch; let received = 0, whole = false, changed = false, corrupt = false;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "HEAD") return new Response(null, { headers: { "content-length": String(bytes.length), etag: '"v1"' } });
    const headers = new Headers(init?.headers); assert.equal(headers.get("if-match"), '"v1"');
    if (whole) return new Response("must not read this entire file");
    const [, first, last] = headers.get("range")!.match(/^bytes=(\d+)-(\d+)$/)!;
    const start = Number(first), end = Number(last); received += end - start + 1;
    const chunk = Buffer.from(bytes.subarray(start, end + 1));
    if (corrupt && chunk.length < 100 && chunk.length !== 30) chunk[0] ^= 0xff;
    return new Response(chunk, { status: 206, headers: { "content-range": `bytes ${start}-${end}/${bytes.length}`, etag: changed ? '"v2"' : '"v1"' } });
  };
  try {
    const result = await readOfficialZip("https://www.ans.gov.br/test.zip", name => name.startsWith("TUSS 22"));
    assert.equal(result.bytes.toString(), "official workbook bytes"); assert.ok(received < 100_000);
    changed = true; await assert.rejects(readOfficialZip("https://www.ans.gov.br/test.zip", name => name.startsWith("TUSS 22")), /versão/);
    changed = false; whole = true; await assert.rejects(readOfficialZip("https://www.ans.gov.br/test.zip", () => true), /intervalo/);
    whole = false; corrupt = true; await assert.rejects(readOfficialZip("https://www.ans.gov.br/test.zip", name => name.startsWith("TUSS 22")));
  } finally { globalThis.fetch = original; }
});
