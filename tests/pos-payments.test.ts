import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "../src/db/schema";
import type { db } from "../src/db";
import { PosPaymentRepository } from "../src/lib/pos-payment-repository";
import { buildPosPaymentSettings, posProviderReady } from "../src/lib/pos-providers";
import { checkoutInputHash, checkoutUrlIsSafe, paymentCents, posPaymentStatus, verifyPosPayment, type MercadoPagoPayment } from "../src/lib/pos-payments-policy";

test("validação independente de valor, moeda, conta, ambiente e checkout", () => {
  const expected = { chargeId: "charge", collectorId: "99", environment: "production", amount: 500 };
  const payment: MercadoPagoPayment = { id: 1, status: "approved", collector_id: 99, live_mode: true, transaction_amount: 5, currency_id: "BRL", external_reference: "charge:charge" };
  assert.doesNotThrow(() => verifyPosPayment(payment, expected));
  for (const changes of [{ collector_id: 2 }, { live_mode: false }, { transaction_amount: 4.99 }, { currency_id: "USD" }, { external_reference: "charge:other" }]) assert.throws(() => verifyPosPayment({ ...payment, ...changes }, expected));
  assert.equal(paymentCents(0.1), 10); assert.equal(paymentCents(0.001), null); assert.equal(paymentCents(NaN), null);
  assert.equal(posPaymentStatus({ ...payment, status: "rejected" }), "pending");
  assert.equal(posPaymentStatus({ ...payment, transaction_amount_refunded: 1 }), "partially_refunded");
  assert.ok(checkoutUrlIsSafe("https://www.mercadopago.com.br/checkout/test"));
  for (const url of ["javascript:alert(1)", "https://mercadopago.com.br.evil.com/", "http://mercadopago.com.br/", "https://user:secret@mercadopago.com.br/"]) assert.equal(checkoutUrlIsSafe(url), false);
  assert.ok(checkoutUrlIsSafe("https://sandbox.asaas.com/checkoutSession/show?id=test","asaas"));
  assert.ok(checkoutUrlIsSafe("https://pagamento.pagbank.com.br/pagamento?test","pagbank"));
  assert.equal(checkoutUrlIsSafe("https://pagamento.pagbank.com.br/pagamento?test","asaas"),false);
  for(const provider of ["asaas","mercado_pago","pagbank","efi"]){
    assert.ok(posProviderReady({provider,status:"active",metadata:{webhookStatus:["asaas","efi"].includes(provider)?"active":"configured"}}));
    assert.equal(posProviderReady({provider,status:"disconnected",metadata:{webhookStatus:"configured"}}),false);
    assert.equal(posProviderReady({provider,status:"active",metadata:{webhookStatus:"error"}}),false);
  }
});

test("todos os provedores aptos aparecem sem padrão; padrão não filtra opções e inativo não é selecionado",()=>{
  const rows=["asaas","mercado_pago","pagbank","efi"].map(provider=>({provider,status:"active",metadata:{webhookStatus:["asaas","efi"].includes(provider)?"active":"configured"},environment:"production",isDefault:false}));
  const settings=buildPosPaymentSettings(rows);
  assert.deepEqual(settings.providers.map(p=>p.id),["asaas","mercado_pago","pagbank","efi"]);assert.equal(settings.defaultProvider,"manual");
  rows[1].isDefault=true;
  const withDefault=buildPosPaymentSettings(rows);
  assert.equal(withDefault.defaultProvider,"mercado_pago");assert.equal(withDefault.providers.length,4);
  rows[1].status="disconnected";
  const disconnected=buildPosPaymentSettings(rows);
  assert.equal(disconnected.defaultProvider,"manual");assert.deepEqual(disconnected.providers.map(p=>p.id),["asaas","pagbank","efi"]);
});

test("PDV real em PostgreSQL isolado: reserva, aprovação, replay, cancelamento e estorno", async t => {
  const pg = new PGlite();
  const tables = { users:schema.users, organizations:schema.organizations, organization_members:schema.organizationMembers,
    professionals:schema.professionals, clients:schema.clients, services:schema.services, service_packages:schema.servicePackages,
    service_package_items:schema.servicePackageItems, retail_products:schema.retailProducts, retail_product_variants:schema.retailProductVariants,
    retail_sales:schema.retailSales, retail_sale_items:schema.retailSaleItems, retail_sale_payments:schema.retailSalePayments,
    retail_quotes:schema.retailQuotes, financial_entries:schema.financialEntries, organization_financial_integrations:schema.organizationFinancialIntegrations,
    payment_charges:schema.paymentCharges, payment_charge_events:schema.paymentChargeEvents, client_packages:schema.clientPackages,
    client_package_balances:schema.clientPackageBalances, audit_logs:schema.auditLogs, inventory_products:schema.inventoryProducts,
    inventory_lots:schema.inventoryLots, inventory_lot_allocations:schema.inventoryLotAllocations, inventory_lot_recalls:schema.inventoryLotRecalls,
    inventory_movements:schema.inventoryMovements, appointments:schema.appointments, package_usages:schema.packageUsages };
  const omitted: Record<string,string[]> = { retail_sales:["payment_provider","checkout_key","checkout_input_hash","stock_restored_at"], organization_financial_integrations:["is_default_pos"] };
  try {
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).filter(column => !omitted[name]?.includes(column.name)).map(column => {
        const type = column.enumValues ? "text" : column.getSQLType();
        let fallback = "";
        if ((column.primary && type === "uuid") || column.name === "receipt_token") fallback = " DEFAULT gen_random_uuid()";
        else if (["created_at","updated_at","sold_at","purchased_at"].includes(column.name)) fallback = " DEFAULT now()";
        else if (typeof column.default === "string") fallback = ` DEFAULT '${column.default.replaceAll("'","''")}'`;
        else if (typeof column.default === "number" || typeof column.default === "boolean") fallback = ` DEFAULT ${column.default}`;
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec(await readFile(new URL("../drizzle/0085_pos_online_payments.sql",import.meta.url),"utf8"));
    await pg.exec("CREATE UNIQUE INDEX payment_charge_events_provider_event_unique ON payment_charge_events(provider_event_id)");
    const org = randomUUID(), outside = randomUUID(), client = randomUUID(), stock = randomUUID(), product = randomUUID(), variant = randomUUID(), procedure = randomUUID(), pack = randomUUID();
    await pg.query("INSERT INTO users(id,name) VALUES ('cashier','Operador teste')");
    await pg.query("INSERT INTO organizations(id,name,timezone) VALUES ($1,'Clínica teste','America/Bahia'),($2,'Outra clínica','America/Bahia')",[org,outside]);
    await pg.query("INSERT INTO clients(id,organization_id,name) VALUES ($1,$2,'Cliente sintético')",[client,org]);
    await pg.query("INSERT INTO inventory_products(id,organization_id,name,current_quantity_millis,consumption_quantity_millis,cost_in_cents,lot_tracking,is_active) VALUES ($1,$2,'Produto teste',10000,0,100,false,true)",[stock,org]);
    await pg.query("INSERT INTO retail_products(id,organization_id,name,is_active) VALUES ($1,$2,'Produto teste',true)",[product,org]);
    await pg.query("INSERT INTO retail_product_variants(id,organization_id,product_id,inventory_product_id,name,sale_price_in_cents,is_active,is_for_sale) VALUES ($1,$2,$3,$4,'Apresentação',500,true,true)",[variant,org,product,stock]);
    await pg.query("INSERT INTO services(id,organization_id,name,price_in_cents,is_active) VALUES ($1,$2,'Procedimento teste',1000,true)",[procedure,org]);
    await pg.query("INSERT INTO service_packages(id,organization_id,name,price_in_cents,validity_days,is_active) VALUES ($1,$2,'Pacote teste',2000,30,true)",[pack,org]);
    await pg.query("INSERT INTO service_package_items(package_id,service_id,organization_id,quantity) VALUES ($1,$2,$3,2)",[pack,procedure,org]);
    await pg.query("INSERT INTO organization_financial_integrations(id,organization_id,provider,status,environment,metadata) VALUES ($1,$2,'mercado_pago','active','production',$3)",[randomUUID(),org,JSON.stringify({accountId:99,webhookStatus:"configured"})]);
    const database = drizzle(pg,{schema}) as unknown as typeof db;
    const globals = globalThis as unknown as { __posDb: typeof db; __posContext: unknown };
    globals.__posDb = database;
    Object.assign(globalThis,{__posOtherContext:async (_org:string,provider:string)=>({collectorId:"0",paymentEnvironment:"production",credentialFingerprint:checkoutInputHash({provider,secret:provider==="efi"?JSON.stringify({clientId:"efi-test",clientSecret:"secret-test",pixKey:"key-test",certificateBase64:"certificate-test"}):`${provider}-test`})})});
    globals.__posContext = { organization: { id:org,name:"Clínica teste",role:"owner",timezone:"America/Bahia" }, session:{user:{id:"cashier"}} };
    const compiled = await build({entryPoints:["src/actions/retail.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:"pos-mocks",setup(builder){
      const mocks:Record<string,string> = { "@/db":"export const db=globalThis.__posDb;", "@/lib/session":"export async function requireOrganization(){return globalThis.__posContext;}",
        "next/cache":"export function revalidatePath(){}", "@/lib/attendance":"export function requireAttendance(){throw new Error('No attendance in this test')}",
        "@/lib/mercado-pago":"export async function getMercadoPagoCredential(){return {accessToken:'test-only',webhookSecret:'test-only',environment:'production'}}",
        "@/lib/pos-checkout":"export async function ensurePosCheckout(){} export const posOtherContext=(org,provider)=>globalThis.__posOtherContext(org,provider)", "@/lib/email":"export async function sendRetailReceiptEmail(){}", "@/lib/outbox-trigger":"export async function triggerOutboxWorker(){}",
        "@/lib/catalog-image":"export async function persistWithCatalogImage(){}", "@/lib/cloudinary":"export async function deleteCatalogImage(){}" };
      builder.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:"pos-mocks"}:undefined);
      builder.onLoad({filter:/.*/,namespace:"pos-mocks"},args=>({contents:mocks[args.path],loader:"js"}));
    }}]});
    const actionModule = { exports:{} as {registerRetailSale:(data:FormData)=>Promise<{openUrl?:string;error?:string}>} };
    new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),actionModule,actionModule.exports);
    const register = actionModule.exports.registerRetailSale;
    async function create(items = [{variantId:variant,quantity:1,discountInCents:0}], key = randomUUID(), provider = "mercado_pago") {
      const form = new FormData(); form.set("checkoutProvider",provider); form.set("checkoutKey",key); form.set("items",JSON.stringify(items)); form.set("payments","[]"); form.set("clientId",client);
      const result = await register(form);
      assert.ok(result.openUrl?.startsWith("/vendas/pagamento/"));
      const saleId=result.openUrl!.split("/").at(-1)!;
      const charge=(await pg.query<{id:string;amount_in_cents:number}>("SELECT id,amount_in_cents FROM payment_charges WHERE origin_id=$1",[saleId])).rows[0];
      return { saleId,charge,key,form };
    }
    const repository = new PosPaymentRepository(database);
    await t.test("Asaas e PagBank: checkout, aprovação, estorno parcial, cancelamento e padrão por empresa",async()=>{
      for(const provider of ["asaas","pagbank"]) await pg.query("INSERT INTO organization_financial_integrations(id,organization_id,provider,status,environment,metadata) VALUES ($1,$2,$3,'active','production',$4)",[randomUUID(),org,provider,JSON.stringify({webhookStatus:provider==="asaas"?"active":"configured"})]);
      let asaasPayments:unknown[]=[],pagBankCharges:unknown[]=[],asaasCreates=0,pagBankCreates=0;
      const asaasId=randomUUID(),pagBankId=`CHEC_${randomUUID()}`;
      let pagBankReference="";
      Object.assign(globalThis,{
        __posAsaas:async (path:string,_credential:unknown,init:{method?:string;body?:Record<string,unknown>}={})=>{
          if(path==="/checkouts"&&init.method==="POST"){asaasCreates++;assert.deepEqual(init.body?.billingTypes,["PIX","CREDIT_CARD"]);return {id:asaasId};}
          if(path.endsWith("/cancel"))return {};
          if(path.startsWith("/payments?"))return {data:asaasPayments,hasMore:false};
          if(init.method==="DELETE") {asaasPayments=[];return {deleted:true};}
          throw new Error(`Unexpected Asaas request ${path}`);
        },
        __posPagBank:async(path:string,_credential:unknown,init:{method?:string;body?:Record<string,unknown>}={})=>{
          if(path==="/checkouts"&&init.method==="POST"){pagBankCreates++;pagBankReference=String(init.body?.reference_id);return {id:pagBankId,links:[{rel:"PAY",href:"https://pagamento.pagbank.com.br/pagamento?test"}]};}
          if(path.endsWith("/inactivate"))return {};
          if(path.startsWith("/checkouts/"))return {id:pagBankId,reference_id:pagBankReference,payments:[{id:"ORDE_test",charges:pagBankCharges}]};
          throw new Error(`Unexpected PagBank request ${path}`);
        },
      });
      const compiledProviders=await build({entryPoints:["src/lib/pos-checkout.ts","src/actions/pos-payment-settings.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",outdir:"tmp/mock",plugins:[{name:"provider-mocks",setup(builder){
        const mocks:Record<string,string>={"@/db":"export const db=globalThis.__posDb;","./asaas":"export const organizationAsaasRequest=(...args)=>globalThis.__posAsaas(...args);","./organization-asaas":"export async function getOrganizationAsaasCredential(){return {apiKey:'asaas-test',environment:'production'}}","./pagbank":"export async function getPagBankCredential(){return {token:'pagbank-test',environment:'production'}} export const pagBankRequest=(...args)=>globalThis.__posPagBank(...args);","@/lib/session":"export async function requireOrganization(){return globalThis.__posContext;}","@/lib/audit":"export async function writeAuditLog(){}","next/cache":"export function revalidatePath(){}"};
        builder.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:"provider-mocks"}:undefined);
        builder.onLoad({filter:/.*/,namespace:"provider-mocks"},args=>({contents:mocks[args.path],loader:"js"}));
      }}]});
      type Providers={ensurePosCheckout:(org:string,id:string)=>Promise<void>;refreshPosPayment:(org:string,id:string)=>Promise<void>;cancelPosCheckout:(org:string,id:string,user:string)=>Promise<void>;normalizeAsaasPos:(charge:unknown,p:unknown)=>unknown;normalizePagBankPos:(charge:unknown,p:unknown)=>unknown};
      const loaded={exports:{} as Providers},defaults={exports:{} as {setPosPaymentDefault:(data:FormData)=>Promise<unknown>}};
      for(const output of compiledProviders.outputFiles){const target=output.path.includes("pos-payment-settings")?defaults:loaded;new Function("require","module","exports",output.text)(createRequire(import.meta.url),target,target.exports);}
      for(const provider of ["asaas","pagbank"]){
        const created=await create(undefined,undefined,provider);
        await Promise.all([loaded.exports.ensurePosCheckout(org,created.saleId),loaded.exports.ensurePosCheckout(org,created.saleId)]);
        const before=(await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0];assert.equal(before.status,"pending_payment");
        if(provider==="asaas")asaasPayments=[{id:"pay_test",checkoutSession:asaasId,status:"CONFIRMED",value:5,netValue:4.5,billingType:"PIX"}];
        else pagBankCharges=[{id:"CHAR_test",status:"PAID",amount:{value:500,currency:"BRL",summary:{paid:500,refunded:0}},payment_method:{type:"PIX"}}];
        await loaded.exports.refreshPosPayment(org,created.saleId);await loaded.exports.refreshPosPayment(org,created.saleId);
        assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"completed");
        if(provider==="asaas")asaasPayments=[{id:"pay_test",checkoutSession:asaasId,status:"CONFIRMED",value:5,refunds:[{value:1,status:"DONE"}]}];
        else pagBankCharges=[{id:"CHAR_test",status:"PAID",amount:{value:500,currency:"BRL",summary:{paid:500,refunded:100}}}];
        await loaded.exports.refreshPosPayment(org,created.saleId);
        assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"payment_review");
        asaasPayments=[];pagBankCharges=[];
        const unpaid=await create(undefined,undefined,provider);await loaded.exports.ensurePosCheckout(org,unpaid.saleId);
        await loaded.exports.cancelPosCheckout(org,unpaid.saleId,"cashier");
        assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[unpaid.saleId])).rows[0].status,"cancelled");
        const form=new FormData();form.set("provider",provider);form.set("enabled","true");await defaults.exports.setPosPaymentDefault(form);
        assert.equal((await pg.query<{provider:string}>("SELECT provider FROM organization_financial_integrations WHERE organization_id=$1 AND is_default_pos",[org])).rows[0].provider,provider);
      }
      assert.equal(asaasCreates,2);assert.equal(pagBankCreates,2);
      const unchecked=new FormData();unchecked.set("provider","asaas");await defaults.exports.setPosPaymentDefault(unchecked);
      assert.equal((await pg.query<{provider:string}>("SELECT provider FROM organization_financial_integrations WHERE organization_id=$1 AND is_default_pos",[org])).rows[0].provider,"pagbank");
      const invalid=new FormData();invalid.set("provider","other");invalid.set("enabled","true");assert.ok((await defaults.exports.setPosPaymentDefault(invalid) as {error:string}).error);
      // Reset the fixture inventory for the independent Mercado Pago scenarios.
      await pg.query("UPDATE inventory_products SET current_quantity_millis=10000 WHERE id=$1",[stock]);
      await pg.query("UPDATE organization_financial_integrations SET is_default_pos=false WHERE organization_id=$1",[org]);
      const charge={amountInCents:500,metadata:{checkoutId:asaasId,environment:"production"}};
      assert.throws(()=>loaded.exports.normalizeAsaasPos(charge,{id:"pay",checkoutSession:"another",value:5,status:"CONFIRMED"}));
      assert.throws(()=>loaded.exports.normalizePagBankPos(charge,{id:"CHAR_bad",status:"PAID",amount:{value:499,currency:"BRL",summary:{paid:499}}}));
    });
    await t.test("Efí Pix: criação única, confirmação por API, devolução, recuperação e cancelamento",async()=>{
      await pg.query("INSERT INTO organization_financial_integrations(id,organization_id,provider,status,environment,metadata) VALUES ($1,$2,'efi','active','production',$3)",[randomUUID(),org,JSON.stringify({webhookStatus:"active"})]);
      let creates=0,fail=false;
      let cob={txid:"",status:"ATIVA",chave:"key-test",valor:{original:"5.00"},pixCopiaECola:"000201synthetic-test-pix",pix:[] as {endToEndId:string;horario:string;valor:string;devolucoes?:{valor:string;status:string}[]}[]};
      Object.assign(globalThis,{__posEfi:async(path:string,_credential:unknown,input:{method?:string}={})=>{
        if(input.method==="PUT"){creates++;cob={...cob,txid:path.split("/").at(-1)!,status:"ATIVA",pix:[]};if(fail)throw new Error("Ambiguous timeout");}
        if(input.method==="PATCH")cob.status="REMOVIDA_PELO_USUARIO_RECEBEDOR";
        return structuredClone(cob);
      }});
      const bundle=await build({entryPoints:["src/lib/pos-checkout.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:"efi-test",setup(builder){
        const mocks:Record<string,string>={"@/db":"export const db=globalThis.__posDb;","./efi":"export async function getEfiCredential(){return {clientId:'efi-test',clientSecret:'secret-test',pixKey:'key-test',certificateBase64:'certificate-test',environment:'production'}} export const efiRequest=(...args)=>globalThis.__posEfi(...args);"};
        builder.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:"efi-test"}:undefined);
        builder.onLoad({filter:/.*/,namespace:"efi-test"},args=>({contents:mocks[args.path],loader:"js"}));
      }}]});
      const adapter={exports:{} as {ensurePosCheckout:(org:string,id:string)=>Promise<void>;refreshPosPayment:(org:string,id:string)=>Promise<void>;cancelPosCheckout:(org:string,id:string,user:string)=>Promise<void>}};
      new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),adapter,adapter.exports);
      const paid=await create(undefined,undefined,"efi");
      await Promise.all([adapter.exports.ensurePosCheckout(org,paid.saleId),adapter.exports.ensurePosCheckout(org,paid.saleId)]);assert.equal(creates,1);
      const stored=(await pg.query<{status:string;pix_qr_code_payload:string}>("SELECT status,pix_qr_code_payload FROM payment_charges WHERE id=$1",[paid.charge.id])).rows[0];assert.equal(stored.status,"pending");assert.equal(stored.pix_qr_code_payload,cob.pixCopiaECola);
      cob.status="CONCLUIDA";cob.pix=[{endToEndId:"E_synthetic",horario:new Date().toISOString(),valor:"4.99"}];
      await adapter.exports.refreshPosPayment(org,paid.saleId);
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[paid.saleId])).rows[0].status,"payment_review");
      // A mismatching payment must never automatically fulfil a sale.
      const completed=await create(undefined,undefined,"efi");await adapter.exports.ensurePosCheckout(org,completed.saleId);
      cob.status="CONCLUIDA";cob.pix=[{endToEndId:"E_complete",horario:new Date().toISOString(),valor:"5.00"}];
      await adapter.exports.refreshPosPayment(org,completed.saleId);await adapter.exports.refreshPosPayment(org,completed.saleId);
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[completed.saleId])).rows[0].status,"completed");
      await assert.rejects(adapter.exports.cancelPosCheckout(org,completed.saleId,"cashier"));
      cob.pix[0].devolucoes=[{valor:"1.00",status:"DEVOLVIDO"}];await adapter.exports.refreshPosPayment(org,completed.saleId);
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[completed.saleId])).rows[0].status,"payment_review");
      const uncertain=await create(undefined,undefined,"efi");fail=true;
      await adapter.exports.ensurePosCheckout(org,uncertain.saleId);await adapter.exports.ensurePosCheckout(org,uncertain.saleId);assert.equal(creates,3);
      await adapter.exports.refreshPosPayment(org,uncertain.saleId);
      assert.equal((await pg.query<{metadata:{checkoutState:string}}>("SELECT metadata FROM payment_charges WHERE id=$1",[uncertain.charge.id])).rows[0].metadata.checkoutState,"ready");
      await adapter.exports.cancelPosCheckout(org,uncertain.saleId,"cashier");
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[uncertain.saleId])).rows[0].status,"cancelled");
      await pg.query("UPDATE inventory_products SET current_quantity_millis=10000 WHERE id=$1",[stock]);
    });
    await t.test("página pública consulta o vínculo da cobrança sem erro de tipos SQL", async () => {
      const pageBundle=await build({entryPoints:["src/app/pagamento/venda/[token]/page.tsx"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",jsx:"automatic",plugins:[{name:"public-page-mock",setup(builder){
        const mocks:Record<string,string>={"@/db":"export const db=globalThis.__posDb;","next/navigation":"export function notFound(){throw new Error('TEST_NOT_FOUND')} export function useRouter(){return {refresh(){}}}"};
        builder.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:"public-page-mock"}:undefined);
        builder.onLoad({filter:/.*/,namespace:"public-page-mock"},args=>({contents:mocks[args.path],loader:"js"}));
      }}]});
      const pageModule={exports:{} as {default:(input:{params:Promise<{token:string}>})=>Promise<unknown>}};
      new Function("require","module","exports",pageBundle.outputFiles[0].text)(createRequire(import.meta.url),pageModule,pageModule.exports);
      await assert.rejects(pageModule.exports.default({params:Promise.resolve({token:randomUUID()})}),/TEST_NOT_FOUND/);
      const pending=await create();
      const token=(await pg.query<{receipt_token:string}>("SELECT receipt_token FROM retail_sales WHERE id=$1",[pending.saleId])).rows[0].receipt_token;
      assert.ok(await pageModule.exports.default({params:Promise.resolve({token})}));
      await repository.cancelUnpaid(org,pending.saleId,"cashier");
    });
    await t.test("criação externa concorrente ocorre uma vez e timeout não gera segunda cobrança", async () => {
      let calls = 0;
      let fail = false;
      const networkGlobals = globalThis as unknown as { __posRequest: (path:string,token:string,input:{body:Record<string,unknown>})=>Promise<unknown> };
      networkGlobals.__posRequest = async (path, _token, input) => {
        assert.equal(path,"/checkout/preferences"); calls++;
        assert.ok(String(input.body.external_reference).startsWith("charge:"));
        assert.equal(input.body.expires,true);
        if(fail) throw new Error("Simulated ambiguous timeout");
        return {id:"test-preference",init_point:"https://www.mercadopago.com.br/checkout/test"};
      };
      const helper = await build({entryPoints:["src/lib/pos-mercado-pago.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:"network-mock",setup(builder){
        builder.onResolve({filter:/^(?:@\/db|\.\/mercado-pago)$/},args=>({path:args.path,namespace:"network-mock"}));
        builder.onLoad({filter:/.*/,namespace:"network-mock"},args=>({contents:args.path==="@/db"?"export const db=globalThis.__posDb;":"export const mercadoPagoRequest=(...args)=>globalThis.__posRequest(...args); export async function getMercadoPagoCredential(){return {accessToken:'test-only',environment:'production'}}",loader:"js"}));
      }}]});
      const loaded={exports:{} as {ensurePosCheckout:(org:string,sale:string)=>Promise<void>}};
      new Function("require","module","exports",helper.outputFiles[0].text)(createRequire(import.meta.url),loaded,loaded.exports);
      const ready=await create();
      await Promise.all([loaded.exports.ensurePosCheckout(org,ready.saleId),loaded.exports.ensurePosCheckout(org,ready.saleId)]);
      assert.equal(calls,1);
      assert.equal((await pg.query<{invoice_url:string}>("SELECT invoice_url FROM payment_charges WHERE id=$1",[ready.charge.id])).rows[0].invoice_url,"https://www.mercadopago.com.br/checkout/test");
      await repository.cancelUnpaid(org,ready.saleId,"cashier");
      fail=true;
      const uncertain=await create();
      await loaded.exports.ensurePosCheckout(org,uncertain.saleId);
      await loaded.exports.ensurePosCheckout(org,uncertain.saleId);
      assert.equal(calls,2);
      assert.equal((await pg.query<{metadata:{checkoutState:string}}>("SELECT metadata FROM payment_charges WHERE id=$1",[uncertain.charge.id])).rows[0].metadata.checkoutState,"uncertain");
      await repository.cancelUnpaid(org,uncertain.saleId,"cashier");
    });
    const paymentFor = (charge:{id:string;amount_in_cents:number}, overrides:Partial<MercadoPagoPayment>={}):MercadoPagoPayment=>({id:Math.floor(Math.random()*1e9),status:"approved",collector_id:99,live_mode:true,currency_id:"BRL",external_reference:`charge:${charge.id}`,transaction_amount:charge.amount_in_cents/100,date_approved:new Date().toISOString(),date_last_updated:new Date().toISOString(),payment_method_id:"pix",fee_details:[{amount:0.1}],transaction_details:{net_received_amount:charge.amount_in_cents/100-0.1},...overrides});
    await t.test("um checkout reserva estoque, mantém financeiro pendente e bloqueia pacote; retry não duplica",async()=>{
      const created=await create([{variantId:variant,quantity:1,discountInCents:0},{variantId:`package:${pack}`,quantity:1,discountInCents:0}]);
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"pending_payment");
      assert.equal((await pg.query<{status:string}>("SELECT status FROM financial_entries WHERE id=(SELECT financial_entry_id FROM retail_sales WHERE id=$1)",[created.saleId])).rows[0].status,"pending");
      assert.equal((await pg.query<{status:string}>("SELECT status FROM client_packages WHERE retail_sale_id=$1",[created.saleId])).rows[0].status,"pending_payment");
      assert.equal((await pg.query<{balance:number}>("SELECT current_quantity_millis as balance FROM inventory_products WHERE id=$1",[stock])).rows[0].balance,9000);
      await Promise.all([register(created.form), register(created.form)]);
      assert.equal((await pg.query("SELECT id FROM retail_sales WHERE checkout_key=$1",[created.key])).rows.length,1);
      const payment=paymentFor(created.charge);
      await repository.apply(org,created.charge.id,payment); await repository.apply(org,created.charge.id,payment);
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"completed");
      assert.equal((await pg.query<{status:string}>("SELECT status FROM client_packages WHERE retail_sale_id=$1",[created.saleId])).rows[0].status,"active");
      assert.equal((await pg.query<{balance:number}>("SELECT current_quantity_millis as balance FROM inventory_products WHERE id=$1",[stock])).rows[0].balance,9000);
      await repository.apply(org,created.charge.id,{...payment,status:"pending",date_last_updated:new Date(Date.now()-10000).toISOString()});
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"completed");
      await repository.apply(org,created.charge.id,{...payment,status:"refunded",transaction_amount_refunded:25,date_last_updated:new Date(Date.now()+1000).toISOString()});
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"refunded");
      assert.equal((await pg.query<{status:string}>("SELECT status FROM client_packages WHERE retail_sale_id=$1",[created.saleId])).rows[0].status,"suspended");
      assert.equal((await pg.query<{balance:number}>("SELECT current_quantity_millis as balance FROM inventory_products WHERE id=$1",[stock])).rows[0].balance,9000);
    });
    await t.test("cancelamento confirmado devolve a reserva uma única vez; pagamento tardio pede conferência",async()=>{
      const created=await create();
      await repository.cancelUnpaid(org,created.saleId,"cashier"); await repository.cancelUnpaid(org,created.saleId,"cashier");
      assert.equal((await pg.query<{balance:number}>("SELECT current_quantity_millis as balance FROM inventory_products WHERE id=$1",[stock])).rows[0].balance,9000);
      const payment=paymentFor(created.charge);
      await repository.apply(org,created.charge.id,payment);
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"payment_review");
      await repository.apply(org,created.charge.id,{...payment,date_last_updated:new Date(Date.now()+1000).toISOString()});
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"payment_review");
    });
    await t.test("conta, valor, ambiente e outra organização não podem liberar a venda",async()=>{
      const created=await create(), payment=paymentFor(created.charge);
      await assert.rejects(repository.apply(outside,created.charge.id,payment));
      for(const changes of [{collector_id:4},{transaction_amount:1},{live_mode:false}]) await assert.rejects(repository.apply(org,created.charge.id,{...payment,...changes}));
      assert.equal((await pg.query<{status:string}>("SELECT status FROM retail_sales WHERE id=$1",[created.saleId])).rows[0].status,"pending_payment");
    });
    await t.test("um único provedor padrão por empresa; outra empresa não interfere",async()=>{
      await pg.query("UPDATE organization_financial_integrations SET is_default_pos=true WHERE organization_id=$1 AND provider='mercado_pago'",[org]);
      await assert.rejects(pg.query("INSERT INTO organization_financial_integrations(id,organization_id,provider,is_default_pos) VALUES ($1,$2,'other',true)",[randomUUID(),org]));
      await pg.query("INSERT INTO organization_financial_integrations(id,organization_id,provider,is_default_pos) VALUES ($1,$2,'other',true)",[randomUUID(),outside]);
    });
    await t.test("recebimento manual misto continua concluído e sem cobrança externa; sem permissão não vende",async()=>{
      const form=new FormData(); form.set("checkoutProvider","manual"); form.set("items",JSON.stringify([{variantId:variant,quantity:1,discountInCents:0}])); form.set("payments",JSON.stringify([{method:"cash",amountInCents:200},{method:"pix",amountInCents:300}]));
      const result=await register(form);
      assert.ok(result.openUrl?.startsWith("/recibo/"));
      const receipt=result.openUrl!.split("/").at(-1)!;
      const sale=(await pg.query<{id:string;status:string;payment_provider:string|null}>("SELECT id,status,payment_provider FROM retail_sales WHERE receipt_token=$1",[receipt])).rows[0];
      assert.equal(sale.status,"completed"); assert.equal(sale.payment_provider,null);
      assert.equal((await pg.query("SELECT id FROM payment_charges WHERE origin_id=$1",[sale.id])).rows.length,0);
      globals.__posContext={organization:{id:org,name:"Clínica teste",role:"viewer",timezone:"America/Bahia"},session:{user:{id:"cashier"}}};
      await assert.rejects(register(form),/permissão/);
    });
  } finally { await pg.close(); }
});
