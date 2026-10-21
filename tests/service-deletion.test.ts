import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { serviceDeletionError } from "../src/lib/service-deletion";

test("linked procedures produce a helpful error while unused procedures can be deleted", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE services (id integer PRIMARY KEY);
      CREATE TABLE appointments (service_id integer REFERENCES services(id) ON DELETE RESTRICT);
      INSERT INTO services VALUES (1), (2);
      INSERT INTO appointments VALUES (1);`);
    await assert.rejects(db.exec("DELETE FROM services WHERE id = 1"), error => {
      assert.match(serviceDeletionError(error)!, /desmarque Ativo/);
      assert.equal(serviceDeletionError(new Error("Failed query", { cause: error })), serviceDeletionError(error));
      return true;
    });
    assert.equal((await db.query("SELECT * FROM appointments")).rows.length, 1);
    await db.exec("DELETE FROM services WHERE id = 2");
    assert.deepEqual((await db.query("SELECT id FROM services")).rows, [{ id: 1 }]);
    assert.equal(serviceDeletionError(new Error("Connection failed")), null);
    assert.match(serviceDeletionError({ cause: { code: "23503" } })!, /desmarque Ativo/);
    assert.equal(serviceDeletionError({ code: "23505" }), null);
    const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
    assert.equal(serviceDeletionError(cycle), null);
  } finally {
    await db.close();
  }
});
