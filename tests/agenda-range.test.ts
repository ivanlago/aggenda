import assert from "node:assert/strict";
import test from "node:test";
import { agendaRange } from "../src/lib/agenda-range";

test("agenda accepts past dates, clamps month ends and rejects invalid dates", () => {
  const january = agendaRange("2026-01-31", "month", "America/Bahia");
  assert.equal(january.start.toISOString(), "2026-01-31T03:00:00.000Z");
  assert.equal(january.end.toISOString(), "2026-02-28T03:00:00.000Z");
  const fallback = agendaRange("2026-02-30", "invalid", "America/Bahia", new Date("2026-10-17T01:00:00Z"));
  assert.equal(fallback.anchor, "2026-10-16");
  assert.equal(fallback.period, "month");
  const dst = agendaRange("2026-03-08", "day", "America/New_York");
  assert.equal(dst.end.getTime() - dst.start.getTime(), 23 * 60 * 60 * 1000);
});
