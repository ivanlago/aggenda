import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { hybridAnswerSchema } from "../src/lib/whatsapp-hybrid";

test("pilot sends its complete schema to the provider; repair retains it; commercial mode is unchanged", async () => {
  const bundle = await build({ entryPoints: ["src/lib/ai/provider.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "isolated-budget", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/commercial-ai-budget$/ }, () => ({ path: "budget", namespace: "test" }));
    builder.onLoad({ filter: /./, namespace: "test" }, () => ({ contents: "export async function reserveAgentAiBudget(){return null} export async function settleAgentAiBudget(){}", loader: "js" }));
  } }] });
  const providerModule = { exports: {} as { generateAiJson: typeof import("../src/lib/ai/provider").generateAiJson } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), providerModule, providerModule.exports);
  const previous = {url: process.env.AI_API_URL, key: process.env.AI_API_KEY, model: process.env.AI_MODEL, fetch: globalThis.fetch};
  const requests: {response_format: {type: string; json_schema?: {schema: {required: string[]}}}; messages: {content:string}[]}[] = [];
  const valid = {action: "availability", reply: "Vou consultar os horários.", intent: "schedule", confidence: 0.95, serviceId: null, professionalId: null, appointmentId: null, date: "2026-11-16", time: null, period: "morning", cancellationReason: null};
  const answers = [{action: "availability", reply: null}, valid, valid];
  try {
    process.env.AI_API_URL = "https://provider.invalid/chat/completions";
    process.env.AI_API_KEY = "fake"; process.env.AI_MODEL = "fake";
    globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({choices: [{message: {content: JSON.stringify(answers.shift())}}], usage: {prompt_tokens: 10, completion_tokens: 10}});
    };
    const result = await providerModule.exports.generateAiJson({ schema: hybridAnswerSchema, structuredOutput: true, messages: [{role: "system", content: "Use apenas dados fictícios."}, {role: "user", content: "Quero um corte amanhã."}] });
    assert.equal(result.data.action, "availability");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].messages.filter(message => "role" in message && message.role === "system").length, 1);
    assert.match(requests[0].messages[0].content, /Use apenas dados fictícios/);
    assert.match(requests[0].messages[0].content, /serviceId/);
    for (const request of requests) {
      assert.equal(request.response_format.type, "json_schema");
      for (const field of ["reply", "intent", "confidence", "serviceId", "professionalId", "appointmentId", "cancellationReason"])
        assert.ok(request.response_format.json_schema!.schema.required.includes(field));
    }
    assert.match(requests[1].messages.at(-1)!.content, /reply/);
    await providerModule.exports.generateAiJson({ schema: hybridAnswerSchema, messages: [{role: "user", content: "Teste legado"}] });
    assert.deepEqual(requests[2].response_format, {type: "json_object"});
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [["AI_API_URL", previous.url], ["AI_API_KEY", previous.key], ["AI_MODEL", previous.model]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});
