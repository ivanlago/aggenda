import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const summary = await client.query(`
  select 'channels' kind, count(*)::text n, max(updated_at)::text latest from whatsapp_channels
  union all
  select 'messages', count(*)::text, max(created_at)::text from chat_messages where created_at > now() - interval '30 minutes'
  union all
  select 'outbox', count(*)::text, max(created_at)::text from outbox_events where created_at > now() - interval '30 minutes'
`);
const channels = await client.query(`
  select phone_number_id, display_phone_number, connection_status, is_active, updated_at
  from whatsapp_channels order by updated_at desc
`);
const outbox = await client.query(`
  select event_type, status, attempts, left(coalesce(last_error, ''), 300) last_error, created_at, updated_at
  from outbox_events where created_at > now() - interval '30 minutes'
  order by created_at desc limit 10
`);
const messages = await client.query(`
  select direction, status, message_type, created_at, occurred_at
  from chat_messages where created_at > now() - interval '30 minutes'
  order by created_at desc limit 10
`);
const plans = await client.query(`
  select organization_id, whatsapp_service_code, whatsapp_monthly_limit, ai_monthly_limit
  from organization_service_plans
`);
const usage = await client.query(`
  select organization_id, period_start, metric, quantity
  from organization_usage_counters
  where period_start >= date_trunc('month', now())::date
  order by metric
`);
const destinations = await client.query(`
  select event_type, payload->>'phoneNumberId' as phone_number_id,
         length(coalesce(payload->>'to', '')) as recipient_length,
         right(coalesce(payload->>'to', ''), 4) as recipient_suffix
  from outbox_events where event_type in ('whatsapp.message.send', 'whatsapp.template.send')
  order by created_at desc limit 5
`);

console.log(JSON.stringify({ summary: summary.rows, channels: channels.rows, messages: messages.rows, plans: plans.rows, usage: usage.rows, destinations: destinations.rows, outbox: outbox.rows }, null, 2));
await client.end();
