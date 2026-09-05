import { z } from "zod";

type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiRole;
  content: string;
};

type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AiJsonResult<T> = AiUsage & {
  data: T;
  model: string;
};

function configuration() {
  const apiUrl = process.env.AI_API_URL ?? process.env.CRM_AI_API_URL;
  const apiKey = process.env.AI_API_KEY ?? process.env.CRM_AI_API_KEY;
  const model = process.env.AI_MODEL ?? process.env.CRM_AI_MODEL;
  if (!apiUrl || !apiKey || !model) {
    throw new Error("Configure AI_API_URL, AI_API_KEY e AI_MODEL para ativar a camada de IA do Aggenda.");
  }
  return { apiUrl, apiKey, model };
}

export function configuredAiModel() {
  return configuration().model;
}

export async function generateAiJson<T>(options: {
  messages: AiMessage[];
  schema: z.ZodType<T>;
  timeoutMs?: number;
}): Promise<AiJsonResult<T>> {
  const { apiUrl, apiKey, model } = configuration();
  const jsonSchema = JSON.stringify(z.toJSONSchema(options.schema));
  const schemaInstruction: AiMessage = {
    role: "system",
    content: `A resposta deve ser exclusivamente um objeto JSON válido que satisfaça exatamente este JSON Schema. Não crie ações, campos ou valores fora dele: ${jsonSchema}`,
  };
  const request = async (messages: AiMessage[]) => {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, response_format: { type: "json_object" }, messages }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`O provedor de IA respondeu HTTP ${response.status}: ${detail}`);
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("O provedor de IA retornou uma resposta vazia.");
    return { content, usage: payload.usage };
  };

  const first = await request([schemaInstruction, ...options.messages]);
  let firstJson: unknown;
  try { firstJson = JSON.parse(first.content); } catch { firstJson = null; }
  const firstValidation = options.schema.safeParse(firstJson);
  if (firstValidation.success) {
    return { data: firstValidation.data, model, inputTokens: first.usage?.prompt_tokens, outputTokens: first.usage?.completion_tokens };
  }

  const repaired = await request([
    schemaInstruction,
    ...options.messages,
    { role: "assistant", content: first.content },
    { role: "user", content: `A resposta anterior não respeitou o contrato (${firstValidation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}). Corrija-a e devolva somente o objeto JSON válido.` },
  ]);
  let repairedJson: unknown;
  try { repairedJson = JSON.parse(repaired.content); } catch { throw new Error("A resposta corrigida da IA não veio no formato JSON esperado."); }
  return {
    data: options.schema.parse(repairedJson),
    model,
    inputTokens: (first.usage?.prompt_tokens ?? 0) + (repaired.usage?.prompt_tokens ?? 0),
    outputTokens: (first.usage?.completion_tokens ?? 0) + (repaired.usage?.completion_tokens ?? 0),
  };
}
