import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { paymentKindSupported } from "../src/lib/payment-catalog-policy";

test("default accounts and methods seed existing/new companies without resetting custom choices", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE financial_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations(id),name text,account_type text,created_at timestamp DEFAULT now(),UNIQUE(organization_id,name));
      CREATE TABLE payment_methods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations(id),name text,kind text,provider text,default_account_id uuid REFERENCES financial_accounts(id),is_active boolean DEFAULT true);
      CREATE UNIQUE INDEX method_name ON payment_methods(organization_id,lower(name));
      INSERT INTO organizations VALUES('00000000-0000-0000-0000-000000000001');
      INSERT INTO financial_accounts(id,organization_id,name,account_type) VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Banco','bank'),('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Minha conta','bank');
      INSERT INTO payment_methods(organization_id,name,kind,provider,default_account_id,is_active) VALUES('00000000-0000-0000-0000-000000000001','Pix','pix','manual','00000000-0000-0000-0000-000000000003',false),('00000000-0000-0000-0000-000000000001','Boleto','boleto','manual',null,true);`);
    await pg.exec(await readFile(new URL("../drizzle/0094_default_payment_accounts.sql", import.meta.url), "utf8"));
    await pg.exec("SELECT aggenda_seed_payment_defaults(id) FROM organizations");
    const existing = await pg.query<{name:string;account:string;is_active:boolean}>("SELECT m.name,a.name account,m.is_active FROM payment_methods m JOIN financial_accounts a ON a.id=m.default_account_id ORDER BY m.name");
    assert.equal(existing.rows.length,7);
    assert.equal(existing.rows.find(row=>row.name==='Dinheiro')?.account,'cofre');
    assert.equal(existing.rows.find(row=>row.name==='Boleto Bancário')?.account,'Banco');
    assert.deepEqual(existing.rows.find(row=>row.name==='Pix'),{name:'Pix',account:'Minha conta',is_active:false});
    assert.equal((await pg.query("SELECT * FROM financial_accounts")).rows.length,3);
    await pg.exec("INSERT INTO organizations VALUES('00000000-0000-0000-0000-000000000004')");
    const fresh=await pg.query<{kind:string;account:string}>("SELECT m.kind,a.name account FROM payment_methods m JOIN financial_accounts a ON a.id=m.default_account_id WHERE m.organization_id='00000000-0000-0000-0000-000000000004'");
    assert.equal(fresh.rows.length,7);
    for(const row of fresh.rows) assert.equal(row.account,row.kind==='cash'?'cofre':'banco');
    assert.equal(paymentKindSupported('link','manual'),true);
  } finally { await pg.close(); }
});
