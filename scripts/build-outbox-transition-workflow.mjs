import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve("Aggenda - Chatbot - corrigido.json");
const outputDirectory = path.resolve("workflows", "transition");
const outputPath = path.join(
  outputDirectory,
  "Aggenda - Chatbot - Outbox.json"
);

const workflow = JSON.parse(await readFile(inputPath, "utf8"));
const triggerName = "Receber mensagem WhatsApp";
const triggerIndex = workflow.nodes.findIndex(
  (node) => node.name === triggerName
);

if (triggerIndex === -1) {
  throw new Error(`Nó não encontrado: ${triggerName}`);
}

const originalTrigger = workflow.nodes[triggerIndex];
if (originalTrigger.type !== "n8n-nodes-base.whatsAppTrigger") {
  throw new Error(`${triggerName} não é um WhatsApp Trigger`);
}

const webhookName = "Entrada Outbox";
const [x, y] = originalTrigger.position;
const webhookNode = {
  parameters: {
    httpMethod: "POST",
    path: "aggenda-whatsapp-outbox",
    responseMode: "onReceived",
    options: {},
  },
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [x, y],
  id: randomUUID(),
  name: webhookName,
  webhookId: randomUUID(),
};

const normalizeNode = {
  parameters: {
    jsCode: `const envelope = $input.first().json;
const body = envelope.body ?? envelope;
const payload = body.entry?.[0]?.changes?.[0]?.value ?? body;

if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
  return [];
}

return [{ json: payload }];`,
  },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [x + 224, y],
  id: randomUUID(),
  name: triggerName,
};

workflow.nodes.splice(triggerIndex, 1, webhookNode, normalizeNode);
workflow.connections[webhookName] = {
  main: [[{ node: triggerName, type: "main", index: 0 }]],
};
workflow.name = `${workflow.name} - Outbox`;
workflow.active = false;
delete workflow.id;
delete workflow.versionId;
delete workflow.meta;
delete workflow.pinData;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
console.log(outputPath);
