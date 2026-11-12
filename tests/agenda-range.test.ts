import assert from "node:assert/strict";
import test from "node:test";
import { agendaRange, shiftAgendaDate } from "../src/lib/agenda-range";

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

test("agenda navigation changes periods and clamps months without overflowing", () => {
  assert.equal(shiftAgendaDate("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(shiftAgendaDate("2026-03-31", "month", -1), "2026-02-28");
  assert.equal(shiftAgendaDate("2028-01-31", "month", 1), "2028-02-29");
  assert.equal(shiftAgendaDate("2026-12-31", "day", 1), "2027-01-01");
  assert.equal(shiftAgendaDate("2026-11-11", "week", -1), "2026-11-04");
});
