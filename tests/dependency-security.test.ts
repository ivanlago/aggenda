import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import type { asn1 } from "node-forge";
import ExcelJS from "exceljs";

test("Forge rejects extra nested DigestAlgorithm elements and accepts canonical signatures", async () => {
  execFileSync(process.execPath, ["scripts/patch-dependency-security.mjs"]);
  const forge: typeof import("node-forge") = createRequire(import.meta.url)("node-forge");
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = forge.pki.privateKeyFromPem(pair.privateKey.export({ type: "pkcs1", format: "pem" }).toString());
  const publicKey = forge.pki.publicKeyFromPem(pair.publicKey.export({ type: "spki", format: "pem" }).toString());
  const md = forge.md.sha256.create(); md.update("synthetic security regression", "utf8");
  const digest = md.digest().getBytes();
  assert.equal(publicKey.verify(digest, privateKey.sign(md)), true);
  const algorithm = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ""),
  ]);
  const info = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [algorithm,
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, digest),
  ]);
  (algorithm.value as asn1.Asn1[]).push(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, "unconsumed garbage"));
  const malformedSignature = (forge.pki.rsa as unknown as { encrypt(data: string, key: typeof privateKey, blockType: number): string }).encrypt(forge.asn1.toDer(info).getBytes(), privateKey, 1);
  assert.throws(() => publicKey.verify(digest, malformedSignature), /DigestInfo/);
});

test("ExcelJS keeps XLSX export/import and extended formatting with the corrected uuid", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pacientes");
  sheet.columns = [{ header: "Nome", key: "name" }, { header: "Valor", key: "amount" }, { header: "Data", key: "date" }];
  sheet.addRow({ name: "Pessoa sintética — João", amount: 250.75, date: new Date("2026-10-15T12:00:00Z") });
  sheet.getCell("B2").numFmt = '"R$" #,##0.00';
  sheet.addConditionalFormatting({ ref: "B2:B10", rules: [{ type: "dataBar", priority: 1, minLength: 0, maxLength: 100, cfvo: [{ type: "min" }, { type: "max" }] }] });
  const bytes = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook(); await restored.xlsx.load(bytes);
  const result = restored.getWorksheet("Pacientes")!;
  assert.equal(result.getCell("A2").value, "Pessoa sintética — João");
  assert.equal(result.getCell("B2").value, 250.75);
  assert.equal((result.getCell("C2").value as Date).toISOString(), "2026-10-15T12:00:00.000Z");
  assert.ok(bytes.byteLength > 0);
});


test("braces accepts normal patterns and rejects deeply nested patterns and ASTs", () => {
  execFileSync(process.execPath, ["scripts/patch-dependency-security.mjs"]);
  const braces = createRequire(import.meta.url)("braces");
  assert.deepEqual(braces.expand("src/{app,lib}/*.ts"), ["src/app/*.ts", "src/lib/*.ts"]);
  const nested = "{".repeat(1000) + "a,b" + "}".repeat(1000);
  for (const method of ["parse", "compile", "expand", "stringify"]) assert.throws(() => braces[method](nested), /nesting limit/);
  assert.throws(() => braces.compile("(".repeat(1000) + "a" + ")".repeat(1000)), /nesting limit/);
  let ast: { type: string; nodes?: unknown[]; value?: string } = { type: "text", value: "a" };
  for (let index = 0; index < 1000; index++) ast = { type: "root", nodes: [ast] };
  for (const method of ["compile", "expand", "stringify"]) assert.throws(() => braces[method](ast), /nesting limit/);
});
