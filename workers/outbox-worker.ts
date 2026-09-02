import "dotenv/config";

import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";

import { Client } from "pg";

import { normalizeDatabaseUrl } from "../src/lib/database-url";
import { decryptWhatsAppToken } from "../src/lib/whatsapp-token";

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
const recoveryInterval = boundedNumber(
  process.env.OUTBOX_RECOVERY_INTERVAL_MS,
  21_600_000,
  3_600_000,
  86_400_000
);
const maxBatchesPerRun = boundedNumber(
  process.env.OUTBOX_MAX_BATCHES_PER_RUN,
  20,
  1,
  100
);
const port = boundedNumber(process.env.PORT, 3000, 1, 65_535);
const triggerSecret = process.env.OUTBOX_TRIGGER_SECRET ?? process.env.AGGENDA_INTERNAL_API_KEY;

let stopping = false;
let activeRun: Promise<RunSummary> | undefined;

type RunSummary = {
  processed: number;
  reminders: number;
  paymentReminders: number;
  nextEventAt: string | null;
};

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

async function enqueueDueReminders(connection: Client) {
  const result = await connection.query<{ id: string }>(
    `with candidates as (
       select appointment.id
       from appointments as appointment
       inner join organization_service_plans as plan
         on plan.organization_id = appointment.organization_id
       where appointment.status in ('scheduled', 'confirmed')
         and appointment.starts_at > now()
         and appointment.starts_at <= now() + interval '24 hours'
         and appointment.reminder_claimed_at is null
         and plan.whatsapp_service_code in ('notify', 'menu', 'chat', 'chat_ai', 'core_ai')
         and not exists (
           select 1
           from outbox_events as reminder
           where reminder.aggregate_type = 'appointment'
             and reminder.aggregate_id = appointment.id::text
             and reminder.payload->>'notificationKind' = 'reminder'
             and reminder.status in ('pending', 'processing', 'processed')
         )
       order by appointment.starts_at
       for update skip locked
       limit 100
     )
     update appointments as appointment
     set reminder_claimed_at = now(), updated_at = now()
     from candidates
     where appointment.id = candidates.id
     returning appointment.id`
  );

  for (const appointment of result.rows) {
    const details = await connection.query<{
      organization_id: string;
      channel_id: string | null;
      phone_number_id: string | null;
      client_name: string;
      client_phone: string | null;
      service_name: string;
      professional_name: string | null;
      timezone: string;
      starts_at: Date;
    }>(
      `select appointment.organization_id, channel.id as channel_id,
              channel.phone_number_id, client.name as client_name,
              client.phone as client_phone, service.name as service_name,
              professional.name as professional_name, organization.timezone,
              appointment.starts_at
       from appointments as appointment
       inner join clients as client on client.id = appointment.client_id
       inner join services as service on service.id = appointment.service_id
       inner join organizations as organization on organization.id = appointment.organization_id
       left join professionals as professional on professional.id = appointment.professional_id
       left join whatsapp_channels as channel
         on channel.organization_id = appointment.organization_id and channel.is_active = true
       where appointment.id = $1
       limit 1`,
      [appointment.id]
    );
    const item = details.rows[0];
    const digits = item?.client_phone?.replace(/\D/g, "") ?? "";
    if (!item?.channel_id || !item.phone_number_id || !digits) {
      await connection.query(`update appointments set reminder_claimed_at = null where id = $1`, [appointment.id]);
      continue;
    }
    const scheduledFor = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: item.timezone,
    }).format(item.starts_at);
    await connection.query(
      `insert into outbox_events
         (organization_id, event_key, event_type, aggregate_type, aggregate_id, payload)
       values ($1, $2, 'whatsapp.template.send', 'appointment', $3, $4::jsonb)
       on conflict (event_key) do nothing`,
      [
        item.organization_id,
        `whatsapp:reminder:${appointment.id}:once`,
        appointment.id,
        JSON.stringify({
          organizationId: item.organization_id,
          channelId: item.channel_id,
          phoneNumberId: item.phone_number_id,
          to: digits.startsWith("55") ? digits : `55${digits}`,
          notificationKind: "reminder",
          appointmentId: appointment.id,
          languageCode: "pt_BR",
          parameters: [item.client_name, item.service_name, scheduledFor, item.professional_name || "Profissional a definir"],
        }),
      ]
    );
  }
  return result.rowCount ?? 0;
}

async function enqueuePaymentReminders(connection: Client) {
  const result = await connection.query<{
    id: string; organization_id: string; customer_name: string; customer_phone: string;
    amount_in_cents: number; due_date: string; invoice_url: string | null; bank_slip_url: string | null;
    channel_id: string; phone_number_id: string; reminder_stage: string;
  }>(
    `select charge.id, charge.organization_id, charge.customer_name, charge.customer_phone,
            charge.amount_in_cents, charge.due_date::text, charge.invoice_url, charge.bank_slip_url,
            channel.id as channel_id, channel.phone_number_id,
            case
              when charge.due_date = current_date + 3 then 'before_3'
              when charge.due_date = current_date then 'due_today'
              when charge.due_date = current_date - 3 then 'overdue_3'
              when charge.due_date = current_date - 7 then 'overdue_7'
            end as reminder_stage
       from payment_charges as charge
       inner join whatsapp_channels as channel
         on channel.organization_id = charge.organization_id and channel.is_active = true
       where charge.status in ('pending', 'overdue')
         and charge.customer_phone is not null
         and coalesce(charge.invoice_url, charge.bank_slip_url) is not null
         and charge.due_date in (current_date + 3, current_date, current_date - 3, current_date - 7)
       order by charge.due_date
       limit 200`
  );
  let queued = 0;
  for (const item of result.rows) {
    const phone = item.customer_phone.replace(/\D/g, "");
    if (!phone || !item.reminder_stage) continue;
    const link = item.invoice_url || item.bank_slip_url;
    const amount = (item.amount_in_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const dueDate = new Date(`${item.due_date}T12:00:00Z`).toLocaleDateString("pt-BR");
    const opening = item.reminder_stage === "before_3" ? "Lembrete de vencimento" : item.reminder_stage === "due_today" ? "Sua cobrança vence hoje" : "Identificamos uma cobrança vencida";
    const inserted = await connection.query(
      `insert into outbox_events (organization_id, event_key, event_type, aggregate_type, aggregate_id, payload)
       values ($1, $2, 'whatsapp.template.send', 'payment_charge', $3, $4::jsonb)
       on conflict (event_key) do nothing returning id`,
      [item.organization_id, `whatsapp:payment-dunning:${item.id}:${item.reminder_stage}`, item.id, JSON.stringify({ organizationId: item.organization_id, channelId: item.channel_id, phoneNumberId: item.phone_number_id, to: phone.startsWith("55") ? phone : `55${phone}`, notificationKind: "payment_dunning", chargeId: item.id, languageCode: "pt_BR", parameters: [item.customer_name, opening, amount, dueDate, link] })]
    );
    if (inserted.rowCount) {
      queued += 1;
      await connection.query(`update payment_charges set last_reminder_at = now(), reminder_count = reminder_count + 1, updated_at = now() where id = $1`, [item.id]);
      await connection.query(`insert into payment_charge_events (organization_id, charge_id, event_type, previous_status, status, payload) select organization_id, id, 'automatic_reminder_queued', status, status, $2::jsonb from payment_charges where id = $1`, [item.id, JSON.stringify({ stage: item.reminder_stage })]);
    }
  }
  return queued;
}

async function processInboundWithAggenda(event: OutboxEvent) {
  const baseUrl = process.env.AGGENDA_INTERNAL_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.AGGENDA_INTERNAL_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("API interna do Aggenda não configurada");
  const url = `${baseUrl}/api/internal/ai/whatsapp`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(event.payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Aggenda AI respondeu HTTP ${response.status}`);
}

async function forwardInboundToN8n(connection: Client, event: OutboxEvent) {
  const workflowProduct = String(event.payload.workflowProduct ?? "");
  if (workflowProduct === "CORE_AI") {
    throw new Error("CORE_AI deve ser processado exclusivamente pelo agente interno do Aggenda");
  }
  const urls: Record<string, string | undefined> = {
    CHAT: process.env.N8N_CHAT_WEBHOOK_URL,
    CHAT_AI: process.env.N8N_CHAT_AI_WEBHOOK_URL,
    CORE: process.env.N8N_CORE_WEBHOOK_URL,
  };
  const url = urls[workflowProduct] ?? process.env.N8N_FALLBACK_WEBHOOK_URL;

  // Keep the internal assistant as a safe fallback for installations that have
  // not configured an operational n8n workflow yet.
  if (!url) {
    await processInboundWithAggenda(event);
    return;
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
  if (!response.ok) throw new Error(`n8n respondeu HTTP ${response.status}`);

  if (workflowProduct.endsWith("_AI")) {
    const organizationId = String(event.payload.organizationId ?? "");
    if (organizationId) {
      await connection.query(
        `insert into organization_usage_counters
           (organization_id, period_start, metric, quantity, updated_at)
         values ($1, date_trunc('month', now())::date, 'ai.calls', 1, now())
         on conflict (organization_id, period_start, metric)
         do update set quantity = organization_usage_counters.quantity + 1, updated_at = now()`,
        [organizationId]
      );
    }
  }
}

async function forwardCommercialAutomationToN8n(event: OutboxEvent) {
  const url = process.env.N8N_COMMERCIAL_WEBHOOK_URL;
  if (!url) throw new Error("Webhook comercial do n8n não configurado");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.N8N_API_KEY ? { "x-n8n-api-key": process.env.N8N_API_KEY } : {}) },
    body: JSON.stringify(event.payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`n8n respondeu HTTP ${response.status}`);
}

async function sendWhatsAppText(connection: Client, event: OutboxEvent) {
  const phoneNumberId = String(event.payload.phoneNumberId ?? "");
  const to = String(event.payload.to ?? "");
  const text = String(event.payload.text ?? "");
  const graphVersion = process.env.META_WHATSAPP_GRAPH_VERSION ?? "v23.0";

  const channelResult = phoneNumberId
    ? await connection.query<{ encrypted_access_token: string | null }>(
      `select encrypted_access_token from whatsapp_channels where phone_number_id = $1 and is_active = true limit 1`,
      [phoneNumberId]
    )
    : null;
  const encryptedToken = channelResult?.rows[0]?.encrypted_access_token;
  const token = encryptedToken
    ? decryptWhatsAppToken(encryptedToken)
    : process.env.META_WHATSAPP_ACCESS_TOKEN;

  if (!token || !phoneNumberId || !to || !text) {
    throw new Error("Credenciais ou payload de envio do WhatsApp incompletos");
  }

  const recipients = brazilianRecipientCandidates(to);
  let lastError = "";
  for (const recipient of recipients) {
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
          to: recipient,
          type: "text",
          text: { preview_url: false, body: text },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (response.ok) return;
    lastError = `Meta respondeu HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`;
    if (!lastError.includes("131030")) break;
  }
  throw new Error(lastError || "Meta recusou o envio do WhatsApp");
}

function brazilianRecipientCandidates(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 12) {
    return [digits, `${digits.slice(0, 4)}9${digits.slice(4)}`];
  }
  return [digits];
}

async function sendWhatsAppTemplate(connection: Client, event: OutboxEvent) {
  const phoneNumberId = String(event.payload.phoneNumberId ?? "");
  const to = String(event.payload.to ?? "");
  const notificationKind = String(event.payload.notificationKind ?? "");
  if (notificationKind === "reminder" && event.payload.appointmentId) {
    const current = await connection.query<{ starts_at: Date; status: string }>(
      `select starts_at, status from appointments where id = $1 limit 1`,
      [String(event.payload.appointmentId)]
    );
    const appointment = current.rows[0];
    const reminderFor = String(event.payload.reminderFor ?? "");
    if (!appointment || !["scheduled", "confirmed"].includes(appointment.status)
      || (reminderFor && appointment.starts_at.toISOString() !== reminderFor)) {
      return false;
    }
  }
  const templateNames: Record<string, string | undefined> = {
    confirmation: process.env.META_TEMPLATE_APPOINTMENT_CONFIRMATION,
    reschedule: process.env.META_TEMPLATE_APPOINTMENT_RESCHEDULE,
    cancellation: process.env.META_TEMPLATE_APPOINTMENT_CANCELLATION,
    reminder: process.env.META_TEMPLATE_APPOINTMENT_REMINDER,
    payment_charge: process.env.META_TEMPLATE_PAYMENT_CHARGE,
    payment_dunning: process.env.META_TEMPLATE_PAYMENT_DUNNING,
    recovery: process.env.META_TEMPLATE_PATIENT_RECOVERY,
  };
  const templateName = templateNames[notificationKind];
  const parameters = Array.isArray(event.payload.parameters)
    ? event.payload.parameters.map((value) => String(value))
    : [];
  const graphVersion = process.env.META_WHATSAPP_GRAPH_VERSION ?? "v23.0";
  const channelResult = phoneNumberId
    ? await connection.query<{ encrypted_access_token: string | null }>(
      `select encrypted_access_token from whatsapp_channels where phone_number_id = $1 and is_active = true limit 1`,
      [phoneNumberId]
    )
    : null;
  const encryptedToken = channelResult?.rows[0]?.encrypted_access_token;
  const token = encryptedToken ? decryptWhatsAppToken(encryptedToken) : process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneNumberId || !to || !templateName) {
    throw new Error(`Configuração incompleta para template ${notificationKind}`);
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: String(event.payload.languageCode ?? "pt_BR") },
        components: [{
          type: "body",
          parameters: parameters.map((text) => ({ type: "text", text })),
        }],
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Meta respondeu HTTP ${response.status}: ${detail}`);
  }
  return true;
}

async function recordOutboundUsage(connection: Client, event: OutboxEvent) {
  const organizationId = String(event.payload.organizationId ?? "");
  if (!organizationId) return;
  await connection.query(
    `insert into organization_usage_counters
       (organization_id, period_start, metric, quantity, updated_at)
     values ($1, date_trunc('month', now())::date, 'whatsapp.outbound', 1, now())
     on conflict (organization_id, period_start, metric)
     do update set quantity = organization_usage_counters.quantity + 1, updated_at = now()`,
    [organizationId]
  );
  if (event.payload.notificationKind === "reminder" && event.payload.appointmentId) {
    await connection.query(
      `update appointments set reminder_sent_at = now(), updated_at = now() where id = $1`,
      [String(event.payload.appointmentId)]
    );
  }
  if ((event.payload.notificationKind === "payment_charge" || event.payload.notificationKind === "payment_dunning") && event.payload.chargeId) {
    await connection.query(
      `insert into payment_charge_events (organization_id, charge_id, event_type, previous_status, status, payload)
       select organization_id, id, 'whatsapp_sent', status, status, $2::jsonb from payment_charges where id = $1`,
      [String(event.payload.chargeId), JSON.stringify({ notificationKind: event.payload.notificationKind })]
    );
  }
}

async function handleEvent(connection: Client, event: OutboxEvent) {
  switch (event.event_type) {
    case "whatsapp.message.received":
      if (String(event.payload.workflowProduct ?? "") === "CORE_AI") await processInboundWithAggenda(event);
      else await forwardInboundToN8n(connection, event);
      return;
    case "commercial.automation.requested":
      await forwardCommercialAutomationToN8n(event);
      return;
    case "whatsapp.message.send":
      await sendWhatsAppText(connection, event);
      await recordOutboundUsage(connection, event);
      return;
    case "whatsapp.template.send":
      if (await sendWhatsAppTemplate(connection, event)) {
        await recordOutboundUsage(connection, event);
      }
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

async function drain(includeScheduled: boolean): Promise<RunSummary> {
  const connection = new Client({ connectionString: normalizeDatabaseUrl(requiredDatabaseUrl) });
  const summary: RunSummary = { processed: 0, reminders: 0, paymentReminders: 0, nextEventAt: null };
  await connection.connect();
  try {
    if (includeScheduled) {
      summary.reminders = await enqueueDueReminders(connection);
      summary.paymentReminders = await enqueuePaymentReminders(connection);
    }

    for (let batch = 0; batch < maxBatchesPerRun && !stopping; batch += 1) {
      const events = await claimEvents(connection);
      if (events.length === 0) break;
      for (const event of events) {
        try {
          await handleEvent(connection, event);
          await markProcessed(connection, event);
          summary.processed += 1;
        } catch (error) {
          console.error(`[outbox] falha no evento ${event.id}`, error);
          await markFailed(connection, event, error);
        }
      }
    }
    const next = await connection.query<{ available_at: Date | null }>(
      `select min(available_at) as available_at
       from outbox_events
       where status = 'pending' and available_at > now()`
    );
    summary.nextEventAt = next.rows[0]?.available_at?.toISOString() ?? null;
    return summary;
  } finally {
    await connection.end();
  }
}

function runOnDemand(includeScheduled: boolean) {
  if (activeRun) return activeRun;
  activeRun = drain(includeScheduled)
    .then((summary) => {
      console.log(`[outbox] execução concluída: ${JSON.stringify(summary)}`);
      armNextEvent(summary.nextEventAt);
      return summary;
    })
    .finally(() => {
      activeRun = undefined;
    });
  return activeRun;
}

let nextEventTimer: NodeJS.Timeout | undefined;

function armNextEvent(nextEventAt: string | null) {
  if (nextEventTimer) clearTimeout(nextEventTimer);
  nextEventTimer = undefined;
  if (!nextEventAt || stopping) return;
  const delay = new Date(nextEventAt).getTime() - Date.now();
  if (delay <= 0 || delay > recoveryInterval) return;
  nextEventTimer = setTimeout(() => {
    if (!stopping) void runOnDemand(false).catch((error) => console.error("[outbox] evento agendado falhou", error));
  }, Math.max(1_000, delay));
  nextEventTimer.unref();
}

function authorized(header: string | undefined) {
  if (!triggerSecret || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(triggerSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, running: Boolean(activeRun) }));
    return;
  }

  if (request.method === "POST" && (request.url === "/drain" || request.url === "/scheduled")) {
    if (!authorized(request.headers.authorization)) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    const alreadyRunning = Boolean(activeRun);
    void runOnDemand(request.url === "/scheduled").catch((error) => {
      console.error("[outbox] execução sob demanda falhou", error);
    });
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({ accepted: true, alreadyRunning }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

const schedule = setInterval(() => {
  if (!stopping) void runOnDemand(true).catch((error) => console.error("[outbox] varredura agendada falhou", error));
}, recoveryInterval);
schedule.unref();

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  clearInterval(schedule);
  if (nextEventTimer) clearTimeout(nextEventTimer);
  console.log(`[outbox] encerrando após ${signal}`);
  server.close();
  await activeRun?.catch(() => undefined);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(port, "0.0.0.0", () => {
  console.log(`[outbox] worker ${workerId} aguardando acionamentos na porta ${port}; recuperação a cada ${recoveryInterval / 60_000} min`);
  void runOnDemand(true).catch((error) => console.error("[outbox] recuperação inicial falhou", error));
});
