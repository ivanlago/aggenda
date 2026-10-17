/* Temporary backport for GHSA-86w9-cpqp-85rv / CVE-2026-85393.
 * Reference: https://github.com/digitalbazaar/forge/pull/1152/files
 * Keep the advisory visible in npm audit until an official fixed release exists.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const packageFile = require.resolve("node-forge/package.json");
const version = JSON.parse(readFileSync(packageFile, "utf8")).version;
if (version !== "1.4.0") throw new Error("Review the Forge security backport before changing node-forge versions.");
const rsaFile = path.join(path.dirname(packageFile), "lib/rsa.js");
const source = readFileSync(rsaFile, "utf8");
const original = "obj.value.length !== 2) {";
const replacement = "obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {";
// Pin the upstream source so an unexpected dependency cannot be patched silently.
const expectedHash = "fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50";
const unpatched = source.includes(replacement) ? source.replace(replacement, original) : source;
if (createHash("sha256").update(unpatched).digest("hex") !== expectedHash || unpatched.split(original).length !== 2) {
  throw new Error("Unexpected Forge RSA source; security backport was not applied.");
}
if (!source.includes(replacement)) writeFileSync(rsaFile, source.replace(original, replacement));
console.log("Forge 1.4.0: nested DigestAlgorithm validation backport verified.");
