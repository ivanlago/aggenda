import assert from "node:assert/strict";
import test from "node:test";
import { parseClientMeasurement } from "../src/lib/client-measurements";
test("accepts optional measurements with decimal comma or point", () => {
  assert.equal(parseClientMeasurement(null, "weightKg"), null);
  assert.equal(parseClientMeasurement("", "heightCm"), null);
  assert.equal(parseClientMeasurement("70,5", "weightKg"), "70.50");
  assert.equal(parseClientMeasurement("175.25", "heightCm"), "175.25");
});
test("rejects invalid measurements instead of silently rounding", () => {
  for (const value of ["0", "-1", "abc", "Infinity", "1.234", "1e2", "1000"]) {
    assert.throws(() => parseClientMeasurement(value, "heightCm"));
  }
});
