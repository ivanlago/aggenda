import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema";

test("attendance transfer enforces administrator, organization, status and availability while preserving financial data", async () => {
 const pg = new PGlite();
 const globals = globalThis as typeof globalThis & { transferFixture?: unknown };
 try {
  const columns = Object.values(getTableColumns(schema.appointments)).map(column => `"${column.name}" ${["status", "source"].includes(column.name) ? "text" : column.getSQLType()}`);
  await pg.exec(`CREATE TABLE appointments (${columns.join(",")}); CREATE TABLE professionals (id uuid, organization_id uuid, is_active boolean, is_bookable boolean);`);
  const org = randomUUID(), id = randomUUID(), old = randomUUID(), target = randomUUID(), foreign = randomUUID();
  await pg.query("INSERT INTO professionals VALUES ($1,$2,true,true),($3,$4,true,true)", [target, org, foreign, randomUUID()]);
  await pg.query("INSERT INTO appointments(id,organization_id,professional_id,client_id,service_id,status,starts_at,ends_at,price_in_cents) VALUES ($1,$2,$3,$4,$5,'scheduled','2026-12-01 13:00','2026-12-01 14:00',35000)", [id,org,old,randomUUID(),randomUUID()]);
  const database = drizzle(pg, { schema });
  const fixture = { db: database, role: "professional", available: true, failInventory: false, audit: [] as unknown[], context: {} as unknown };
  globals.transferFixture = fixture;
  const bundle = await build({ stdin: { contents: 'export {saveAppointmentEdit} from "./src/actions/appointment-edit"', resolveDir: process.cwd(), loader: "ts" }, bundle:true,write:false,platform:"node",format:"cjs",packages:"external", plugins:[{name:"transfer-boundaries",setup(b){
   const mocks:Record<string,string>={
    "@/db":"export const db=globalThis.transferFixture.db",
    "@/lib/attendance":"export async function requireAttendance(){return {...globalThis.transferFixture.context,organization:{id:globalThis.transferFixture.context.appointment.organizationId,role:globalThis.transferFixture.role,timezone:'America/Bahia',slotIntervalMinutes:30},session:{user:{id:'admin'}}}}",
    "@/lib/appointment-safety":"export const organizationDate=()=> '2026-12-01';export const withAppointmentLock=(_o,_p,fn)=>globalThis.transferFixture.db.transaction(fn)",
    "@/lib/availability":"export const isTimeAvailable=async()=>globalThis.transferFixture.available",
    "@/lib/google-calendar":"export async function deleteAppointmentFromGoogleCalendar(){};export async function syncAppointmentToGoogleCalendar(){}",
    "@/lib/audit":"export async function writeAuditLog(input){globalThis.transferFixture.audit.push(input)}",
    "@/lib/permissions":"export function assertOrganizationPermission(){}",
    "@/lib/finance":"export async function syncAppointmentFinancialEntry(){}",
    "@/lib/whatsapp-notifications":"export async function enqueueAppointmentNotification(){}",
    "@/lib/inventory":"export async function updateAppointmentAndInventory(input,database){return database.transaction(async tx=>{if(globalThis.transferFixture.failInventory) throw new Error('Estoque indisponível'); const {appointments}=await import('@/db/schema'); const {eq}=await import('drizzle-orm'); await tx.update(appointments).set({status:input.status}).where(eq(appointments.id,input.appointmentId));return true})}",
    "next/cache":"export function revalidatePath(){}"
   };b.onResolve({filter:/./},a=>mocks[a.path]?{path:a.path,namespace:"fixture"}:undefined);b.onLoad({filter:/./,namespace:"fixture"},a=>({contents:mocks[a.path],loader:"js",resolveDir:process.cwd()}));
  }}] });
  const bundled={exports:{} as {saveAppointmentEdit:(data:FormData)=>Promise<{error?:string}|undefined>}};
  new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),bundled,bundled.exports);
  const refresh=async()=>{fixture.context={appointment:(await database.select().from(schema.appointments))[0]}};
  await refresh(); const form=new FormData(); form.set("id",id);form.set("professionalId",target);form.set("startsAt","2026-12-01T13:00:00.000Z");form.set("status","confirmed");
  assert.match((await bundled.exports.saveAppointmentEdit(form))?.error??"",/administrador/);
  fixture.role="admin";fixture.available=false;
  assert.match((await bundled.exports.saveAppointmentEdit(form))?.error??"",/disponibilidade/);
  fixture.available=true;form.set("professionalId",foreign);
  assert.match((await bundled.exports.saveAppointmentEdit(form))?.error??"",/habilitado/);
  form.set("professionalId",target);
  fixture.failInventory=true;
  assert.match((await bundled.exports.saveAppointmentEdit(form))?.error??"",/Estoque indisponível/);
  const [unchanged]=await database.select().from(schema.appointments);assert.equal(unchanged.professionalId,old);assert.equal(unchanged.status,"scheduled");
  fixture.failInventory=false;
  assert.equal(await bundled.exports.saveAppointmentEdit(form),undefined);
  const [updated]=await database.select().from(schema.appointments);
  assert.equal(updated.professionalId,target);assert.equal(updated.priceInCents,35000);assert.equal(updated.status,"confirmed");assert.equal(fixture.audit.length,1);
  await pg.query("UPDATE appointments SET status='completed',professional_id=$1 WHERE id=$2",[old,id]);await refresh();
  assert.match((await bundled.exports.saveAppointmentEdit(form))?.error??"",/agendamentos ativos/);
 } finally {delete globals.transferFixture;await pg.close()}
});
