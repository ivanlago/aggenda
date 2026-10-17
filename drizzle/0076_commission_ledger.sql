CREATE TABLE "commission_payment_items" (
	"payment_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"amount_in_cents" integer NOT NULL,
	CONSTRAINT "commission_payment_items_payment_id_entry_id_pk" PRIMARY KEY("payment_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "commission_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"beneficiary_key" text NOT NULL,
	"beneficiary_name" text NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"financial_entry_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"paid_by_user_id" text NOT NULL,
	"notes" text,
	"reversed_at" timestamp,
	"reversed_by_user_id" text,
	"reversal_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_rules" DROP CONSTRAINT "commission_rules_professional_id_professionals_id_fk";
--> statement-breakpoint
ALTER TABLE "commission_rules" DROP CONSTRAINT "commission_rules_service_id_services_id_fk";
--> statement-breakpoint
ALTER TABLE "commission_entries" ALTER COLUMN "professional_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "beneficiary_user_id" text;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "sale_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "sale_item_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "source_type" text DEFAULT 'appointment' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "description" text DEFAULT 'Comissão de atendimento' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "calculation_type" text;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "calculation_value" integer;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD COLUMN "original_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD COLUMN "beneficiary_user_id" text;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD COLUMN "source_type" text DEFAULT 'appointment' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "commission_professional_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "commission_user_id" text;--> statement-breakpoint
ALTER TABLE "commission_payment_items" ADD CONSTRAINT "commission_payment_items_payment_id_commission_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."commission_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payment_items" ADD CONSTRAINT "commission_payment_items_entry_id_commission_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."commission_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_financial_entry_id_financial_entries_id_fk" FOREIGN KEY ("financial_entry_id") REFERENCES "public"."financial_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_payment_request_unique" ON "commission_payments" USING btree ("organization_id","request_key");--> statement-breakpoint
CREATE INDEX "commission_payment_org_date_idx" ON "commission_payments" USING btree ("organization_id","paid_on");--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_beneficiary_user_id_users_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_sale_id_retail_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_sale_item_id_retail_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."retail_sale_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_payment_id_commission_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."commission_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_beneficiary_user_id_users_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_variant_id_retail_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."retail_product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_commission_professional_id_professionals_id_fk" FOREIGN KEY ("commission_professional_id") REFERENCES "public"."professionals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_commission_user_id_users_id_fk" FOREIGN KEY ("commission_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_source_unique" ON "commission_entries" USING btree ("organization_id","source_key");--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entry_beneficiary_check" CHECK (num_nonnulls("commission_entries"."professional_id", "commission_entries"."beneficiary_user_id") = 1);
--> statement-breakpoint
UPDATE commission_entries SET source_key = 'appointment:' || appointment_id::text WHERE appointment_id IS NOT NULL AND source_key IS NULL;
