import assert from 'node:assert/strict';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
 const { db } = await import('../src/db');
 const { organizations, chatConversations, chatMessages } = await import('../src/db/schema');
 const { eq } = await import('drizzle-orm');
 const { CommercialConversationsPanel } = await import('../src/components/commercial-conversations-panel');
 const [org] = await db.select({ id: organizations.id, timezone: organizations.timezone }).from(organizations).where(eq(organizations.slug, 'administracao-7b923874'));
 assert.ok(org);
 const rows=await db.select().from(chatConversations).where(eq(chatConversations.organizationId,org.id));
 const messages=await db.select({conversationId:chatMessages.conversationId,occurredAt:chatMessages.occurredAt}).from(chatMessages).where(eq(chatMessages.organizationId,org.id));
 const day=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:org.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 const props={organizationId:org.id,timezone:org.timezone,canManage:false,canCreateLead:false};
 async function cards(filters:Record<string,string>,organizationId=org.id) {
   const node=await CommercialConversationsPanel({...props,organizationId,filters});
   return {node,items:node.props.children[1] as Array<{key:string}>};
 }
 const all=await cards({conversationFrom:'2026-01-01',conversationTo:'2026-12-31'});
 assert.equal(all.items.length,rows.length);
 const today=day(new Date());
 const expectedOn=(date:string)=>rows.filter(row=>day(row.lastMessageAt)===date || messages.some(message=>message.conversationId===row.id && day(message.occurredAt)===date)).map(row=>row.id).sort();
 const defaults=await cards({});assert.deepEqual(defaults.items.map(item=>item.key).sort(),expectedOn(today));
 if(messages[0]) {
  const date=day(messages[0].occurredAt);
  const historical=await cards({conversationFrom:date,conversationTo:date});
  assert.deepEqual(historical.items.map(item=>item.key).sort(),expectedOn(date));
 }
 const none=await cards({conversationFrom:'2025-01-01',conversationTo:'2025-01-31'});assert.equal(none.items.length,0);
 const other=await cards({conversationFrom:'2026-01-01',conversationTo:'2026-12-31'},'00000000-0000-0000-0000-000000000001');assert.equal(other.items.length,0);
 if(rows[0]) {
  const name=rows[0].contactName || rows[0].externalContactId;
  const search=await cards({conversationFrom:'2026-01-01',conversationTo:'2026-12-31',conversationSearch:name});
  assert.ok(search.items.some(item=>item.key===rows[0].id));
  const status=await cards({conversationFrom:'2026-01-01',conversationTo:'2026-12-31',conversationStatus:rows[0].handoffStatus});
  assert.equal(status.items.length,rows.filter(row=>row.handoffStatus===rows[0].handoffStatus).length);
  const owner=rows[0].assignedUserId || 'unassigned';
  const owned=await cards({conversationFrom:'2026-01-01',conversationTo:'2026-12-31',conversationOwner:owner});
  assert.equal(owned.items.length,rows.filter(row=>row.assignedUserId===rows[0].assignedUserId).length);
  const client=rows[0].clientId || '00000000-0000-0000-0000-000000000001';
  const customer=await cards({conversationFrom:'2026-01-01',conversationTo:'2026-12-31',conversationClient:client});
  assert.equal(customer.items.length,rows.filter(row=>row.clientId===client).length);
 }
 const invalid=await cards({conversationFrom:'2026-10-02',conversationTo:'2026-09-01'});assert.equal(invalid.items.length,0);
 const second=await cards({conversationFrom:'2026-01-01',conversationTo:'2026-12-31',conversationPage:'2'});assert.equal(second.items.length,Math.max(0,rows.length-50));
 console.log('OK: contatos de hoje, mensagens históricas, período, nome/telefone, cliente, situação, responsável, isolamento entre clínicas, período inválido e paginação. Sem alterações nos dados.');
 await db.$client.end();
}
main().catch(error=>{console.error(error);process.exit(1)});
