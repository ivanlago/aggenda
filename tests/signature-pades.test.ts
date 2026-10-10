import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { assertPadesBinding, embedDetachedCms, inspectPreparedPdf, preparePadesPdf } from "../src/lib/signatures/pades";

async function sample() {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Documento sintetico - teste de integridade");
  return preparePadesPdf(await doc.save());
}

test("preparação preserva PDF legível e ByteRange cobre todos os bytes fora de Contents", async () => {
  const prepared = await sample();
  const parsed = inspectPreparedPdf(prepared);
  assert.equal((await PDFDocument.load(prepared)).getPageCount(), 1);
  assert.equal(parsed.originalHash, createHash("sha256").update(prepared).digest("hex"));
  assert.equal(parsed.content.length, prepared.length - 65538);
  assert.equal(parsed.contentHash, createHash("sha256").update(parsed.content).digest("hex"));
  // Synthetic DER only exercises insertion and byte binding, never trust validation.
  const signed = embedDetachedCms(prepared, Buffer.from("3003020101", "hex"));
  assertPadesBinding(signed, parsed.originalHash);
  assert.deepEqual(inspectPreparedPdf(signed).content, parsed.content);
  assert.throws(() => assertPadesBinding(prepared, parsed.originalHash));
  assert.throws(() => embedDetachedCms(signed, Buffer.from("3000", "hex")));
  await assert.rejects(() => preparePadesPdf(signed), /assinatura anterior/);
});

test("adulteração, revisão anexada e ByteRange ambíguo são rejeitados", async () => {
  const prepared = Buffer.from(await sample());
  const hash = inspectPreparedPdf(prepared).originalHash;
  const signed = Buffer.from(embedDetachedCms(prepared, Buffer.from("3000", "hex")));
  const changed = Buffer.from(signed);
  changed[15] ^= 1;
  assert.throws(() => assertPadesBinding(changed, hash));
  assert.throws(() => inspectPreparedPdf(Buffer.concat([signed, Buffer.from("\n%%EOF")])));
  const duplicate = Buffer.from(signed);
  duplicate.write("/ByteRange ", 15, "ascii");
  assert.throws(() => inspectPreparedPdf(duplicate));
  assert.throws(() => embedDetachedCms(prepared, new Uint8Array(32769).fill(48)));
  assert.throws(() => embedDetachedCms(prepared, new Uint8Array()));
  assert.throws(() => inspectPreparedPdf(new Uint8Array(10 * 1024 * 1024 + 1)));
});
