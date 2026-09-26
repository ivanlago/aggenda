import assert from "node:assert/strict";
import test from "node:test";
import { certificateDaysInWords } from "../src/lib/certificate";

test("writes leave durations in Portuguese across tens and hundreds", () => {
  const cases: [number, string][] = [[1, "um"], [16, "dezesseis"], [20, "vinte"], [21, "vinte e um"], [99, "noventa e nove"], [100, "cem"], [101, "cento e um"], [115, "cento e quinze"], [200, "duzentos"], [300, "trezentos"], [365, "trezentos e sessenta e cinco"]];
  for (const [days, expected] of cases) assert.equal(certificateDaysInWords(days), expected);
  for (let days = 1; days <= 365; days++) assert.ok(certificateDaysInWords(days));
});

test("rejects invalid or unsupported durations", () => {
  for (const days of [0, -1, 1.5, 366, NaN, Infinity]) assert.equal(certificateDaysInWords(days), "");
});
