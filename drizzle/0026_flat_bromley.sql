CREATE TABLE "payment_charge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"provider_event_id" text,
	"event_type" text NOT NULL,
	"previous_status" text,
	"status" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_payment_id" text,
	"provider_customer_id" text,
	"origin_type" text NOT NULL,
	"origin_id" text NOT NULL,
	"financial_entry_id" uuid,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"description" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_document" text,
	"customer_email" text,
	"customer_phone" text,
	"due_date" date NOT NULL,
	"invoice_url" text,
	"bank_slip_url" text,
	"bank_slip_identification_field" text,
	"pix_qr_code_payload" text,
	"pix_qr_code_image" text,
	"paid_at" timestamp,
	"cancelled_at" timestamp,
	"refunded_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_charge_events" ADD CONSTRAINT "payment_charge_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_charge_events" ADD CONSTRAINT "payment_charge_events_charge_id_payment_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."payment_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_financial_entry_id_financial_entries_id_fk" FOREIGN KEY ("financial_entry_id") REFERENCES "public"."financial_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_charge_events_provider_event_unique" ON "payment_charge_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_charge_events_charge_idx" ON "payment_charge_events" USING btree ("charge_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_charges_provider_payment_unique" ON "payment_charges" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payment_charges_org_created_idx" ON "payment_charges" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_charges_origin_idx" ON "payment_charges" USING btree ("organization_id","origin_type","origin_id");--> statement-breakpoint
CREATE INDEX "payment_charges_financial_entry_idx" ON "payment_charges" USING btree ("financial_entry_id");