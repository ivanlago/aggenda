// Isolated Neon branch only. Never points at the application's configured host.
import nextEnv from '@next/env';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
nextEnv.loadEnvConfig('.');
const { Pool } = pg;
const target = 'ep-winter-paper-auwp9kfa.c-10.us-east-1.aws.neon.tech';
const url = new URL(process.env.DATABASE_URL);
if (url.hostname.replace('-pooler', '') === target) throw Error('Expected the application URL, not an overridden validation URL');
url.hostname = target;
url.searchParams.set('sslmode', 'verify-full');
const pool = new Pool({ connectionString: url.toString() });
async function main() {
  const org = randomUUID(), client = randomUUID(), service = randomUUID(), device = randomUUID(), a = randomUUID(), b = randomUUID();
  const first = await pool.connect(), second = await pool.connect();
  try {
    await first.query('BEGIN');
    await first.query('INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)', [org, 'Validação fictícia de equipamentos', `equipment-test-${org}`]);
    await first.query('INSERT INTO clients(id,organization_id,name,phone) VALUES($1,$2,$3,$4)', [client, org, 'Cliente fictício', '71999999999']);
    await first.query('INSERT INTO services(id,organization_id,name,duration_minutes,price_in_cents) VALUES($1,$2,$3,60,10000)', [service, org, 'Serviço fictício']);
    for (const id of [a, b]) await first.query('INSERT INTO professionals(id,organization_id,name) VALUES($1,$2,$3)', [id, org, 'Profissional fictício']);
    await first.query('INSERT INTO equipment(id,organization_id,name) VALUES($1,$2,$3)', [device, org, 'Equipamento fictício exclusivo']);
    await first.query('INSERT INTO services_to_equipment(organization_id,service_id,equipment_id) VALUES($1,$2,$3)', [org, service, device]);
    await first.query('COMMIT');
    const query = 'INSERT INTO appointments(organization_id,client_id,service_id,professional_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)';
    const startsAt = new Date(Date.now() + 7 * 86400000), endsAt = new Date(startsAt.getTime() + 3600000);
    await first.query('BEGIN'); await second.query('BEGIN');
    await first.query(query, [org, client, service, a, startsAt, endsAt]);
    const competing = second.query(query, [org, client, service, b, startsAt, endsAt]).then(() => null, error => error);
    await new Promise(resolve => setTimeout(resolve, 150));
    await first.query('COMMIT');
    const rejected = await competing;
    if (!rejected || rejected.code !== '23P01' || !rejected.message.includes('equipamento')) throw Error('Concurrent equipment reservation was not rejected');
    await second.query('ROLLBACK');
    console.log('Concorrência validada no PostgreSQL: um profissional reserva, o outro recebe conflito de equipamento.');
  } finally {
    await first.query('ROLLBACK'); await second.query('ROLLBACK');
    await first.query('DELETE FROM organizations WHERE id=$1 AND slug=$2', [org, `equipment-test-${org}`]);
    first.release(); second.release();
  }
}
main().finally(() => pool.end()).catch(error => { console.error('Validação falhou:', error.code || error.message); process.exitCode = 1; });
