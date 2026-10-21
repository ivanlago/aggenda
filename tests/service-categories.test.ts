import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("categories preserve existing services, enforce tenant boundaries and normalized names", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE organizations (id uuid PRIMARY KEY);
      CREATE TABLE services (id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id));
      INSERT INTO organizations VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
      INSERT INTO services VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001');`);
    await db.exec(await readFile("drizzle/0080_service_categories.sql", "utf8"));
    assert.equal((await db.query<{ category_id: string | null }>("SELECT category_id FROM services")).rows[0].category_id, null);
    await db.exec(`INSERT INTO service_categories (id, organization_id, name) VALUES
      ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Consultas'),
      ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'Consultas');`);
    await assert.rejects(db.exec(`INSERT INTO service_categories (organization_id, name) VALUES ('00000000-0000-4000-8000-000000000001', ' consultas ')`), /unique/i);
    await assert.rejects(db.exec(`UPDATE services SET category_id = '00000000-0000-4000-8000-000000000005'`), /foreign key/i);
    await db.exec(`UPDATE services SET category_id = '00000000-0000-4000-8000-000000000004'`);
    await assert.rejects(db.exec(`DELETE FROM service_categories WHERE id = '00000000-0000-4000-8000-000000000004'`), /foreign key/i);
    await db.exec(`BEGIN; UPDATE services SET category_id = NULL WHERE category_id = '00000000-0000-4000-8000-000000000004'; DELETE FROM service_categories WHERE id = '00000000-0000-4000-8000-000000000004'; COMMIT;`);
    assert.equal((await db.query("SELECT * FROM services")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM service_categories")).rows.length, 1);
  } finally {
    await db.close();
  }
});
