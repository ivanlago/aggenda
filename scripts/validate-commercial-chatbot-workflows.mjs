import fs from "node:fs";
import path from "node:path";

const directory = process.argv[2] ?? "workflows/commercial";
const expected = new Set([
  "aggenda-chat.json",
  "aggenda-chat-ai.json",
  "aggenda-flow.json",
  "aggenda-flow-ai.json",
  "aggenda-core.json",
  "aggenda-core-ai.json",
]);
const files = fs
  .readdirSync(directory)
  .filter((filename) => filename.endsWith(".json"))
  .sort();

const errors = [];
for (const filename of expected) {
  if (!files.includes(filename)) errors.push(`${filename}: arquivo ausente`);
}

for (const filename of files) {
  const filePath = path.join(directory, filename);
  let workflow;
  try {
    workflow = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${filename}: JSON inválido (${error.message})`);
    continue;
  }
  const names = workflow.nodes.map((node) => node.name);
  const nameSet = new Set(names);
  if (nameSet.size !== names.length) errors.push(`${filename}: nomes de nós duplicados`);
  if (workflow.active !== false) errors.push(`${filename}: deve ser importado inativo`);
  if (!nameSet.has("Receber mensagem WhatsApp")) errors.push(`${filename}: trigger ausente`);
  if (!nameSet.has("Send message")) errors.push(`${filename}: envio ausente`);

  for (const [source, connection] of Object.entries(workflow.connections ?? {})) {
    if (!nameSet.has(source)) errors.push(`${filename}: conexão parte de nó ausente (${source})`);
    for (const groups of Object.values(connection)) {
      for (const group of groups) {
        for (const edge of group) {
          if (!nameSet.has(edge.node)) {
            errors.push(`${filename}: conexão aponta para nó ausente (${edge.node})`);
          }
        }
      }
    }
  }

  for (const node of workflow.nodes) {
    for (const credential of Object.values(node.credentials ?? {})) {
      if (credential.id) errors.push(`${filename}/${node.name}: ID de credencial não removido`);
    }
    if (node.type === "n8n-nodes-base.code") {
      try {
        Function(node.parameters.jsCode);
      } catch (error) {
        errors.push(`${filename}/${node.name}: JavaScript inválido (${error.message})`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Validados ${files.length} workflows comerciais.`);
