import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {build} from "esbuild";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {getTableColumns} from "drizzle-orm";
import * as schema from "../src/db/schema";
import {bookingReservationLabel} from "../src/lib/booking-reservation-status";

test("reservation labels distinguish unpaid deposits, review, expiry and confirmation",()=>{
 const now=new Date("2026-11-13T15:00:00Z");
 assert.equal(bookingReservationLabel({status:"scheduled",depositStatus:"pending",expiresAt:"2026-11-13T15:30:00Z"},now),"Aguardando sinal");
 assert.equal(bookingReservationLabel({status:"scheduled",depositStatus:"pending",expiresAt:now},now),"Reserva expirada");
 assert.equal(bookingReservationLabel({status:"scheduled",depositStatus:"direct_review",expiresAt:now},now),"Pix em conferência");
 assert.equal(bookingReservationLabel({status:"confirmed",depositStatus:"paid"},now),"Confirmado");
 assert.equal(bookingReservationLabel({status:"cancelled",depositStatus:"paid"},now),"Cancelado");
 assert.equal(bookingReservationLabel({status:"scheduled",depositStatus:"not_required"},now),"Agendado");
});

test("expiry cancels both unpaid balances atomically, preserves paid/review, scopes tenants and is idempotent",async()=>{
 const pg=new PGlite(),key=`expiry${randomUUID().replaceAll("-","")}`;const state={database:drizzle(pg),deleted:[] as string[]};Object.assign(globalThis,{[key]:state});
 try{
  for(const [name,table] of Object.entries({appointments:schema.appointments,financial_entries:schema.financialEntries,audit_logs:schema.auditLogs})){
   const columns=Object.values(getTableColumns(table)).map(column=>`"${column.name}" ${column.enumValues?"text":column.getSQLType()}${column.primary?" PRIMARY KEY DEFAULT gen_random_uuid()":""}${["created_at","updated_at"].includes(column.name)?" DEFAULT now()":""}`);await pg.exec(`CREATE TABLE ${name} (${columns.join(",")})`);
  }
  const org=randomUUID(),other=randomUUID(),pending=randomUUID(),direct=randomUUID(),review=randomUUID(),paid=randomUUID(),future=randomUUID(),outside=randomUUID();
  for(const [id,tenant,status,expiry] of [[pending,org,"pending","2000-01-01"],[direct,org,"direct_pending","2000-01-01"],[review,org,"direct_review","2000-01-01"],[paid,org,"paid","2000-01-01"],[future,org,"pending","2099-01-01"],[outside,other,"pending","2000-01-01"]]){
   await pg.query("INSERT INTO appointments(id,organization_id,status,deposit_status,deposit_amount_in_cents,reservation_expires_at) VALUES($1,$2,'scheduled',$3,100,$4)",[id,tenant,status,expiry]);
   await pg.query("INSERT INTO financial_entries(id,organization_id,type,status,source,attendance_id,amount_in_cents) VALUES(gen_random_uuid(),$1,'receivable',$2,'appointment_deposit',$3,100)",[tenant,status==="paid"?"received":"pending",id]);
   await pg.query("INSERT INTO financial_entries(id,organization_id,type,status,source,appointment_id,amount_in_cents) VALUES(gen_random_uuid(),$1,'receivable','pending','appointment',$2,400)",[tenant,id]);
  }
  const output=await build({entryPoints:["src/lib/booking-reservation-expiry.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:key,setup(builder){const mocks:Record<string,string>={"@/db":`export const db=globalThis.${key}.database`,"@/lib/google-calendar":`export async function deleteAppointmentFromGoogleCalendar(id){globalThis.${key}.deleted.push(id)}`};builder.onResolve({filter:/./},args=>mocks[args.path]?{path:args.path,namespace:key}:undefined);builder.onLoad({filter:/./,namespace:key},args=>({contents:mocks[args.path],loader:"js"}));}}]});
  const exported={exports:{} as {expireBookingReservations:(scope?:{organizationId?:string})=>Promise<number>}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),exported,exported.exports);
  assert.equal(await exported.exports.expireBookingReservations({organizationId:org}),2);
  assert.equal(await exported.exports.expireBookingReservations({organizationId:org}),0);
  assert.equal((await pg.query("SELECT * FROM financial_entries WHERE status='cancelled'")).rows.length,4);
  assert.equal((await pg.query("SELECT * FROM financial_entries WHERE status='received'")).rows.length,1);
  assert.equal((await pg.query("SELECT * FROM appointments WHERE deposit_status='direct_review' AND status='scheduled'")).rows.length,1);
  assert.equal((await pg.query("SELECT * FROM appointments WHERE id=$1 AND status='scheduled'",[outside])).rows.length,1);
  assert.equal((await pg.query("SELECT * FROM audit_logs")).rows.length,2);
  assert.equal(state.deleted.length,2);
 }finally{Reflect.deleteProperty(globalThis,key);await pg.close();}
});
