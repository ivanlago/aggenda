import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("tmp/migration-n8n");
const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));

for (const file of files) {
  const filePath = path.join(directory, file);
  const workflow = JSON.parse(await readFile(filePath, "utf8"));

  workflow.active = false;

  for (const node of workflow.nodes ?? []) {
    for (const credential of Object.values(node.credentials ?? {})) {
      delete credential.id;
    }

    const serializedParameters = JSON.stringify(node.parameters ?? {}).replaceAll(
      "https://aggenda-virid.vercel.app",
      "https://www.aggenda.app.br",
    );
    node.parameters = JSON.parse(serializedParameters);
  }

  await writeFile(filePath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  console.log(`${file}: ${workflow.nodes?.length ?? 0} nodes`);
}
