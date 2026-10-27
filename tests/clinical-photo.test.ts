import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseClinicalVisitDate, validateClinicalPhotoPair } from "../src/lib/clinical-photo";

const before = { id: "before", mediaType: "photo", phase: "before", captureSession: "Tratamento facial", bodyRegion: "face", viewCode: "front", consentPurpose: "marketing" };
const after = { ...before, id: "after", phase: "after" };

test("visit dates reject impossible calendar dates and preserve the selected day", () => {
  assert.equal(parseClinicalVisitDate("2026-10-27"), "2026-10-27");
  assert.equal(parseClinicalVisitDate("2028-02-29"), "2028-02-29");
  assert.equal(parseClinicalVisitDate(null), null);
  for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "27/10/2026", "2026-10-27T00:00:00Z"]) assert.throws(() => parseClinicalVisitDate(date));
});

test("compositions require original photos from the same treatment, region and view", () => {
  assert.equal(validateClinicalPhotoPair([after, before]).before.id, "before");
  for (const change of [{ captureSession: "Outro tratamento" }, { bodyRegion: "neck" }, { viewCode: "profile_right" }, { phase: "during" }, { mediaType: "simulation" }]) assert.throws(() => validateClinicalPhotoPair([before, { ...after, ...change }]));
  assert.throws(() => validateClinicalPhotoPair([before]));
  assert.throws(() => validateClinicalPhotoPair([before, before]));
  assert.throws(() => validateClinicalPhotoPair([before, after, after]));
});

test("compositions retain shared permission and fall back to clinical use for mixed purposes", () => {
  assert.equal(validateClinicalPhotoPair([before, after]).consentPurpose, "marketing");
  assert.equal(validateClinicalPhotoPair([{ ...before, consentPurpose: "client_share" }, { ...after, consentPurpose: "client_share" }]).consentPurpose, "client_share");
  assert.equal(validateClinicalPhotoPair([before, { ...after, consentPurpose: "clinical" }]).consentPurpose, "clinical");
});

test("photo migration preserves legacy rows and protects the linked consent document", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE electronic_documents (id uuid PRIMARY KEY); CREATE TABLE client_clinical_media (id uuid PRIMARY KEY, capture_session text); INSERT INTO client_clinical_media VALUES ('00000000-0000-0000-0000-000000000001', 'Tratamento anterior');`);
    await db.exec(await readFile(new URL("../drizzle/0086_clinical_photo_visits.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../drizzle/0087_clinical_photo_consent_reference.sql", import.meta.url), "utf8"));
    const { rows } = await db.query<{ capture_session: string; visit_date: string | null }>("SELECT * FROM client_clinical_media");
    assert.equal(rows[0].capture_session, "Tratamento anterior");
    assert.equal(rows[0].visit_date, null);
    await assert.rejects(db.exec("UPDATE client_clinical_media SET consent_document_id = '00000000-0000-0000-0000-000000000002'"));
    await db.exec("INSERT INTO electronic_documents VALUES ('00000000-0000-0000-0000-000000000002'); UPDATE client_clinical_media SET consent_document_id = '00000000-0000-0000-0000-000000000002', visit_date = '2026-10-27'");
    await assert.rejects(db.exec("DELETE FROM electronic_documents"));
  } finally { await db.close(); }
});
