import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assertPadesBinding, embedDetachedCms, preparePadesPdf } from "../src/lib/signatures/pades";
import { verifyDetachedPades } from "../src/lib/signatures/cms-verification";

async function main() {
  const [command, inputPath, outputPath, cmsPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || !["prepare", "embed"].includes(command) || (command === "embed" && !cmsPath)) {
    throw new Error("Uso: npm run signature:pilot -- prepare entrada.pdf preparado.pdf | embed preparado.pdf resultado.pdf assinatura.p7s");
  }
  const input = await readFile(inputPath);
  const result = command === "prepare" ? await preparePadesPdf(input) : embedDetachedCms(input, await readFile(cmsPath));
  if (command === "embed") {
    const originalHash = createHash("sha256").update(input).digest("hex");
    assertPadesBinding(result, originalHash);
    await verifyDetachedPades(result, originalHash);
  }
  await writeFile(outputPath, result, { flag: "wx" });
  console.log(command === "prepare" ? "PDF preparado. Nenhuma assinatura foi realizada." :
    "CMS incorporado e assinatura criptográfica conferida. Resultado ainda NÃO validado como assinatura ICP-Brasil.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
