CREATE TABLE "cash_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"payment_method_id" uuid,
	"payment_method_name" text,
	"description" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"cash_closing_id" uuid,
	"is_legacy" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "payment_method_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "payment_method_name" text;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "cash_managed_by_sale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "kind" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "default_account_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD COLUMN "payment_method_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD COLUMN "payment_method_name" text;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD COLUMN "refunded_in_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_closing_id_cash_closings_id_fk" FOREIGN KEY ("cash_closing_id") REFERENCES "public"."cash_closings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_account_time_idx" ON "cash_movements" USING btree ("organization_id","account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cash_movements_source_idx" ON "cash_movements" USING btree ("source_type","source_id");--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_default_account_id_financial_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD CONSTRAINT "retail_sale_payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD CONSTRAINT "retail_sale_payments_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- Existing built-ins become editable catalog data; no destinations are guessed.
UPDATE payment_methods SET kind = v.kind
FROM (VALUES ('Dinheiro','cash'),('Cartão de crédito','credit_card'),('Cartão de débito','debit_card'),('Pix','pix'),('Transferência','bank_transfer'),('Boleto','boleto')) AS v(name,kind)
WHERE lower(payment_methods.name)=lower(v.name) AND payment_methods.kind='other';
--> statement-breakpoint
INSERT INTO payment_methods (organization_id,name,kind,provider,is_active)
SELECT o.id,v.name,v.kind,'manual',true FROM organizations o CROSS JOIN
(VALUES ('Dinheiro','cash'),('Cartão de crédito','credit_card'),('Cartão de débito','debit_card'),('Pix','pix'),('Transferência','bank_transfer'),('Boleto','boleto')) AS v(name,kind)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Preserve known legacy account movements, without assigning unclassified receipts.
INSERT INTO cash_movements (organization_id,account_id,source_type,source_id,amount_in_cents,payment_method_id,payment_method_name,description,occurred_at,is_legacy)
SELECT e.organization_id,e.account_id,'financial_entry',e.id,
CASE WHEN e.type='receivable' THEN e.amount_in_cents ELSE -e.amount_in_cents END,
e.payment_method_id,coalesce(e.payment_method_name,e.payment_method),e.description,coalesce(e.updated_at,e.created_at),true
FROM financial_entries e JOIN financial_accounts a ON a.id=e.account_id AND a.organization_id=e.organization_id
WHERE e.status IN ('received','paid') AND NOT e.cash_managed_by_sale;
--> statement-breakpoint
CREATE FUNCTION aggenda_cash_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; current jsonb; org uuid; old_account uuid; new_account uuid; lock_account uuid;
old_amount integer := 0; new_amount integer := 0; source text; source_id uuid;
old_method uuid; new_method uuid; old_name text; new_name text; old_description text; new_description text;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN current := to_jsonb(NEW); END IF;
  org := coalesce((current->>'organization_id')::uuid,(previous->>'organization_id')::uuid);
  source_id := coalesce((current->>'id')::uuid,(previous->>'id')::uuid);
  source := CASE WHEN TG_TABLE_NAME='retail_sale_payments' THEN 'sale_payment' ELSE 'financial_entry' END;
  old_account := (previous->>'account_id')::uuid; new_account := (current->>'account_id')::uuid;
  old_method := (previous->>'payment_method_id')::uuid; new_method := (current->>'payment_method_id')::uuid;
  old_name := coalesce(previous->>'payment_method_name',previous->>'payment_method',previous->>'method');
  new_name := coalesce(current->>'payment_method_name',current->>'payment_method',current->>'method');
  old_description := coalesce(previous->>'description','Recebimento de venda'); new_description := coalesce(current->>'description','Recebimento de venda');
  IF source='sale_payment' THEN
    IF coalesce((current->>'refunded_in_cents')::integer,0)<0 OR coalesce((current->>'refunded_in_cents')::integer,0)>coalesce((current->>'amount_in_cents')::integer,0) THEN RAISE EXCEPTION 'Invalid refunded amount'; END IF;
    IF previous->>'status' IN ('received','partially_refunded') AND old_account IS NOT NULL THEN old_amount := (previous->>'amount_in_cents')::integer-coalesce((previous->>'refunded_in_cents')::integer,0); END IF;
    IF current->>'status' IN ('received','partially_refunded') AND new_account IS NOT NULL THEN new_amount := (current->>'amount_in_cents')::integer-coalesce((current->>'refunded_in_cents')::integer,0); END IF;
  ELSE
    IF previous->>'status' IN ('received','paid') AND old_account IS NOT NULL AND NOT coalesce((previous->>'cash_managed_by_sale')::boolean,false) THEN old_amount := (previous->>'amount_in_cents')::integer * CASE WHEN previous->>'type'='receivable' THEN 1 ELSE -1 END; END IF;
    IF current->>'status' IN ('received','paid') AND new_account IS NOT NULL AND NOT coalesce((current->>'cash_managed_by_sale')::boolean,false) THEN new_amount := (current->>'amount_in_cents')::integer * CASE WHEN current->>'type'='receivable' THEN 1 ELSE -1 END; END IF;
  END IF;
  -- Serialize posting against opening/closing, in deterministic account order.
  FOR lock_account IN SELECT DISTINCT a FROM unnest(ARRAY[old_account,new_account]) a WHERE a IS NOT NULL ORDER BY a LOOP
    IF NOT EXISTS (SELECT 1 FROM financial_accounts WHERE id=lock_account AND organization_id=org) THEN RAISE EXCEPTION 'Account belongs to another organization'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('cash-account:'||org::text||':'||lock_account::text,0));
  END LOOP;
  IF new_method IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payment_methods WHERE id=new_method AND organization_id=org) THEN RAISE EXCEPTION 'Payment method belongs to another organization'; END IF;
  IF old_account IS NOT DISTINCT FROM new_account AND old_method IS NOT DISTINCT FROM new_method AND old_name IS NOT DISTINCT FROM new_name THEN
    IF new_amount<>old_amount THEN
      INSERT INTO cash_movements (organization_id,account_id,source_type,source_id,amount_in_cents,payment_method_id,payment_method_name,description,occurred_at)
      VALUES (org,new_account,source,source_id,new_amount-old_amount,new_method,new_name,coalesce(new_description,old_description),timezone('UTC',clock_timestamp()));
    END IF;
  ELSE
    IF old_amount<>0 THEN INSERT INTO cash_movements (organization_id,account_id,source_type,source_id,amount_in_cents,payment_method_id,payment_method_name,description,occurred_at) VALUES (org,old_account,source,source_id,-old_amount,old_method,old_name,'Estorno / ajuste: '||old_description,timezone('UTC',clock_timestamp())); END IF;
    IF new_amount<>0 THEN INSERT INTO cash_movements (organization_id,account_id,source_type,source_id,amount_in_cents,payment_method_id,payment_method_name,description,occurred_at) VALUES (org,new_account,source,source_id,new_amount,new_method,new_name,new_description,timezone('UTC',clock_timestamp())); END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER financial_entry_cash_movement AFTER INSERT OR UPDATE OR DELETE ON financial_entries FOR EACH ROW EXECUTE FUNCTION aggenda_cash_movement();
--> statement-breakpoint
CREATE TRIGGER sale_payment_cash_movement AFTER INSERT OR UPDATE OR DELETE ON retail_sale_payments FOR EACH ROW EXECUTE FUNCTION aggenda_cash_movement();
