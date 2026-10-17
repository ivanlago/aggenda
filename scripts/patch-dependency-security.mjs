// Temporary, source-pinned mitigations while official patched releases are unavailable.
import "./patch-forge-security.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let bracesPackage;
try { bracesPackage = require.resolve("braces/package.json"); }
catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
if (bracesPackage) {
  if (JSON.parse(readFileSync(bracesPackage, "utf8")).version !== "3.0.3") throw new Error("Review the braces depth mitigation before changing versions.");
  const guard = "if (securityDepth > 64) throw new SyntaxError('Brace pattern exceeds nesting limit (64)');";
  const specs = [
    { file: "parse.js", hash: "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310", changes: [["stack.push(block);", "if (stack.length >= 64) throw new SyntaxError('Brace pattern exceeds nesting limit (64)');\n      stack.push(block);"]] },
    ...["compile.js", "expand.js"].map(file => ({ file, hash: file === "compile.js" ? "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f" : "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7", changes: [
      ["const walk = (node, parent = {}) => {", `const walk = (node, parent = {}, securityDepth = 0) => {\n    ${guard}`],
      ["walk(child, node)", "walk(child, node, securityDepth + 1)"],
    ] })),
    { file: "stringify.js", hash: "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a", changes: [
      ["const stringify = (node, parent = {}) => {", `const stringify = (node, parent = {}, securityDepth = 0) => {\n    ${guard}`],
      ["stringify(child)", "stringify(child, {}, securityDepth + 1)"],
    ] },
  ];
  // Validate every file before writing any of them. Re-running is safe.
  const updates = specs.map(spec => {
    const filename = path.join(path.dirname(bracesPackage), "lib", spec.file);
    const source = readFileSync(filename, "utf8");
    let original = source;
    for (const [before, after] of spec.changes) original = original.split(after).join(before);
    if (createHash("sha256").update(original).digest("hex") !== spec.hash) throw new Error(`Unexpected braces source: ${spec.file}`);
    let patched = original;
    for (const [before, after] of spec.changes) { if (!patched.includes(before)) throw new Error(`Missing braces patch target: ${spec.file}`); patched = patched.split(before).join(after); }
    return { filename, source, patched };
  });
  for (const { filename, source, patched } of updates) if (source !== patched) writeFileSync(filename, patched);
  console.log("braces 3.0.3: bounded nesting mitigation verified (GHSA-vfj7-8cjw-p6xm).");
}
