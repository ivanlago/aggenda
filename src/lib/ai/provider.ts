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
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: options.messages,
    }),
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
  let json: unknown;
  try { json = JSON.parse(content); } catch { throw new Error("A resposta da IA não veio no formato JSON esperado."); }
  return {
    data: options.schema.parse(json),
    model,
    inputTokens: payload.usage?.prompt_tokens,
    outputTokens: payload.usage?.completion_tokens,
  };
}
