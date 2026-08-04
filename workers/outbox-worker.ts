import "dotenv/config";

import os from "node:os";

import { Client } from "pg";

import { normalizeDatabaseUrl } from "../src/lib/database-url";

type OutboxEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não configurada");
const requiredDatabaseUrl: string = databaseUrl;

const workerId =
  process.env.OUTBOX_WORKER_ID ?? `${os.hostname()}:${process.pid}`;
const batchSize = boundedNumber(process.env.OUTBOX_BATCH_SIZE, 10, 1, 50);
const pollInterval = boundedNumber(
  process.env.OUTBOX_POLL_INTERVAL_MS,
  2_000,
  250,
  60_000
);
const idleInterval = boundedNumber(
  process.env.OUTBOX_IDLE_INTERVAL_MS,
  15_000,
  pollInterval,
  300_000
);

let stopping = false;
let client: Client | undefined;

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function claimEvents(connection: Client) {
  const result = await connection.query<OutboxEvent>(
    `with candidates as (
       select id
       from outbox_events
       where (
         (status = 'pending' and available_at <= now())
         or (status = 'processing' and locked_at < now() - interval '5 minutes')
       )
       order by available_at, created_at
       for update skip locked
       limit $1
     )
     update outbox_events as event
     set status = 'processing',
         locked_at = now(),
         locked_by = $2,
         attempts = event.attempts + 1,
         updated_at = now()
     from candidates
     where event.id = candidates.id
     returning event.id, event.event_type, event.payload,
               event.attempts, event.max_attempts`,
    [batchSize, workerId]
  );

  return result.rows;
}

async function forwardInboundToN8n(event: OutboxEvent) {
  const url = process.env.N8N_FALLBACK_WEBHOOK_URL;
  if (!url) {
    throw new Error("N8N_FALLBACK_WEBHOOK_URL não configurada");
  }

  const originalWebhook = event.payload.metaWebhook;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.N8N_API_KEY
        ? { "x-n8n-api-key": process.env.N8N_API_KEY }
        : {}),
    },
    body: JSON.stringify(originalWebhook ?? event.payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`n8n respondeu HTTP ${response.status}`);
  }
}

async function sendWhatsAppText(event: OutboxEvent) {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = String(event.payload.phoneNumberId ?? "");
  const to = String(event.payload.to ?? "");
  const text = String(event.payload.text ?? "");
  const graphVersion = process.env.META_WHATSAPP_GRAPH_VERSION ?? "v23.0";

  if (!token || !phoneNumberId || !to || !text) {
    throw new Error("Credenciais ou payload de envio do WhatsApp incompletos");
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Meta respondeu HTTP ${response.status}: ${detail}`);
  }
}

async function handleEvent(event: OutboxEvent) {
  switch (event.event_type) {
    case "whatsapp.message.received":
      await forwardInboundToN8n(event);
      return;
    case "whatsapp.message.send":
      await sendWhatsAppText(event);
      return;
    default:
      throw new Error(`Evento sem handler: ${event.event_type}`);
  }
}

async function markProcessed(connection: Client, event: OutboxEvent) {
  await connection.query(
    `update outbox_events
     set status = 'processed', processed_at = now(), locked_at = null,
         locked_by = null, last_error = null, updated_at = now()
     where id = $1 and locked_by = $2`,
    [event.id, workerId]
  );
}

async function markFailed(
  connection: Client,
  event: OutboxEvent,
  error: unknown
) {
  const terminal = event.attempts >= event.max_attempts;
  const retrySeconds = Math.min(300, 2 ** event.attempts * 5);
  const message = error instanceof Error ? error.message : String(error);

  await connection.query(
    `update outbox_events
     set status = $3::outbox_status,
         available_at = case when $3 = 'pending'
           then now() + ($4 * interval '1 second') else available_at end,
         locked_at = null, locked_by = null, last_error = $5, updated_at = now()
     where id = $1 and locked_by = $2`,
    [event.id, workerId, terminal ? "failed" : "pending", retrySeconds, message.slice(0, 2000)]
  );
}

async function run() {
  client = new Client({
    connectionString: normalizeDatabaseUrl(requiredDatabaseUrl),
  });
  await client.connect();
  console.log(`[outbox] worker ${workerId} iniciado`);

  while (!stopping) {
    const events = await claimEvents(client);
    if (events.length === 0) {
      await delay(idleInterval);
      continue;
    }

    for (const event of events) {
      if (stopping) break;
      try {
        await handleEvent(event);
        await markProcessed(client, event);
      } catch (error) {
        console.error(`[outbox] falha no evento ${event.id}`, error);
        await markFailed(client, event, error);
      }
    }

    await delay(pollInterval);
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[outbox] encerrando após ${signal}`);
  await client?.end();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

run().catch((error) => {
  console.error("[outbox] erro fatal", error);
  process.exitCode = 1;
});
