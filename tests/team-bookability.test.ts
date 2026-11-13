import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "../src/db/schema";

test("team booking checkbox is independent of access role and preserves historical links",async()=>{
  const pg=new PGlite();
  const key=`bookingTeam${randomUUID().replaceAll("-","")}`;
  const state={database:drizzle(pg),org:randomUUID(),blocked:false};
  Object.assign(globalThis,{[key]:state});
  try {
    const tables={users:schema.users,organizations:schema.organizations,organization_members:schema.organizationMembers,professionals:schema.professionals,professional_registrations:schema.professionalRegistrations,professional_specialties:schema.professionalSpecialties,specialties:schema.specialties,services:schema.services,services_to_professionals:schema.servicesToProfessionals,weekly_availability:schema.weeklyAvailability,availability_exceptions:schema.availabilityExceptions,appointments:schema.appointments,rooms:schema.rooms,equipment:schema.equipment,services_to_equipment:schema.servicesToEquipment};
    for(const [name,table] of Object.entries(tables)){
      const columns=Object.values(getTableColumns(table)).map(column=>{
        const type=column.enumValues?"text":column.getSQLType();
        const fallback=column.primary&&type==="uuid"?" DEFAULT gen_random_uuid()":["created_at","updated_at"].includes(column.name)?" DEFAULT now()":typeof column.default==="string"?` DEFAULT '${column.default.replaceAll("'","''")}'`:typeof column.default==="boolean"||typeof column.default==="number"?` DEFAULT ${column.default}`:"";
        return `"${column.name}" ${type}${column.primary?" PRIMARY KEY":""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX team_member_key ON organization_members(organization_id,user_id); CREATE UNIQUE INDEX team_professional_key ON professionals(organization_id,user_id)");
    for(const id of ["owner","admin","secretary","attendant","newadmin","newstaff","foreign"]) await pg.query("INSERT INTO users(id,name,email) VALUES($1,$1,$2)",[id,`${id}@example.invalid`]);
    for(const [id,role] of [["owner","owner"],["admin","admin"],["secretary","receptionist"],["attendant","professional"]]) await pg.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)",[state.org,id,role]);
    const bundle=await build({stdin:{contents:'export * from "./src/actions/team"; export {getAvailableTimes} from "./src/lib/availability";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:key,setup(builder){
      const mocks:Record<string,string>={"@/db":`export const db=globalThis.${key}.database`,"@/lib/session":`export async function requireOrganization(){return {organization:{id:globalThis.${key}.org,role:'owner'},session:{user:{id:'owner'}}}};export const requireOrganizationMembership=requireOrganization;export async function requireSession(){return {user:{id:'owner'}}}`,"@/lib/auth":"export const auth={api:{requestPasswordReset:async()=>{},signUpEmail:async()=>{throw Error('No real signup allowed')}}}","@/lib/catalog-image":"export async function persistWithCatalogImage({persist}){return persist({})}","@/lib/cloudinary":"export async function deleteCatalogImage(){}","next/cache":"export function revalidatePath(){}","next/navigation":"export function redirect(){throw Error('Unexpected redirect')}","@/lib/commercial-access":`export class CommercialTeamCapacityError extends Error{};export async function checkTeamCapacityAfterChange(){return async()=>{if(globalThis.${key}.blocked) throw new CommercialTeamCapacityError('vaga adicional')}}`};
      builder.onResolve({filter:/./},args=>mocks[args.path]?{path:args.path,namespace:key}:undefined);
      builder.onLoad({filter:/./,namespace:key},args=>({contents:mocks[args.path],loader:"js"}));
    }}]});
    type Result=undefined|{error?:string};
    const actionModule={exports:{} as {createUnifiedTeamMember:(form:FormData)=>Promise<Result>;updateUnifiedTeamMember:(form:FormData)=>Promise<Result>;getAvailableTimes:(input:{organizationId:string;timezone:string;date:string;serviceId:string;professionalId:string})=>Promise<string[]>}};
    new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),actionModule,actionModule.exports);
    const form=(userId:string,role:string,enabled:boolean)=>{const data=new FormData();for(const [k,v] of Object.entries({userId,role,fullName:`Nome ${userId}`,shortName:`Nome ${userId}`,attendanceOptionSubmitted:"1"}))data.set(k,v);if(enabled)data.set("receivesAppointments","on");return data;};
    assert.equal(await actionModule.exports.updateUnifiedTeamMember(form("owner","professional",true)),undefined);
    const professional=async(userId:string)=>(await pg.query<{id:string;is_bookable:boolean;bio:string|null}>("SELECT id,is_bookable,bio FROM professionals WHERE organization_id=$1 AND user_id=$2",[state.org,userId])).rows[0];
    const owner=await professional("owner");assert.equal(owner.is_bookable,true);
    assert.equal((await pg.query<{role:string}>("SELECT role FROM organization_members WHERE user_id='owner'")).rows[0].role,"owner","enabling appointments never changes owner access");
    const service=randomUUID();await pg.query("INSERT INTO services(id,organization_id,name,duration_minutes) VALUES($1,$2,'Serviço',30)",[service,state.org]);
    await pg.query("INSERT INTO services_to_professionals(organization_id,service_id,professional_id) VALUES($1,$2,$3)",[state.org,service,owner.id]);
    await pg.query("INSERT INTO weekly_availability(organization_id,professional_id,day_of_week,starts_at,ends_at) VALUES($1,$2,$3,'09:00','10:00')",[state.org,owner.id,new Date("2099-01-15T12:00:00Z").getUTCDay()]);
    const input={organizationId:state.org,timezone:"America/Bahia",date:"2099-01-15",serviceId:service,professionalId:owner.id};
    assert.equal((await actionModule.exports.getAvailableTimes(input)).length,2,"owner is eligible through the same qualification and availability rules");
    await pg.query("UPDATE professionals SET bio='Preservar perfil' WHERE id=$1",[owner.id]);
    await pg.query("INSERT INTO appointments(organization_id,professional_id,service_id,status,starts_at,ends_at) VALUES($1,$2,$3,'scheduled','2099-01-15 12:00','2099-01-15 12:30')",[state.org,owner.id,service]);
    await actionModule.exports.updateUnifiedTeamMember(form("owner","owner",false));
    assert.equal((await professional("owner")).is_bookable,false);
    assert.equal((await professional("owner")).bio,"Preservar perfil");
    assert.deepEqual(await actionModule.exports.getAvailableTimes(input),[]);
    assert.equal((await pg.query("SELECT * FROM appointments")).rows.length,1);
    assert.equal((await pg.query("SELECT * FROM services_to_professionals")).rows.length,1);
    assert.equal((await pg.query("SELECT * FROM weekly_availability")).rows.length,1);
    await actionModule.exports.updateUnifiedTeamMember(form("owner","owner",true));
    assert.equal((await professional("owner")).id,owner.id,"reenabling keeps the same professional identity");
    assert.equal((await actionModule.exports.getAvailableTimes(input)).length,1);
    await actionModule.exports.updateUnifiedTeamMember(form("secretary","receptionist",true));
    assert.equal((await professional("secretary")).is_bookable,true);
    await actionModule.exports.updateUnifiedTeamMember(form("attendant","professional",false));
    assert.equal((await professional("attendant")).is_bookable,false,"access role does not force bookings");
    const foreign=form("foreign","admin",true);await assert.rejects(actionModule.exports.updateUnifiedTeamMember(foreign),/nesta empresa/);
    const tampered=form("admin","admin",true);tampered.set("professionalId",owner.id);await assert.rejects(actionModule.exports.updateUnifiedTeamMember(tampered),/não vinculado/);
    state.blocked=true;const denied=await actionModule.exports.updateUnifiedTeamMember(form("admin","admin",true));assert.ok(denied?.error);assert.equal(await professional("admin"),undefined,"capacity errors roll back enabling");state.blocked=false;
    for(const [id,role,enabled] of [["newadmin","admin",true],["newstaff","professional",false]] as const){const data=form(id,role,enabled);data.set("email",`${id}@example.invalid`);await actionModule.exports.createUnifiedTeamMember(data);assert.equal((await professional(id)).is_bookable,enabled);}
  } finally {Reflect.deleteProperty(globalThis,key);await pg.close();}
});
