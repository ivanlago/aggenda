ALTER TABLE "payment_charges" ADD COLUMN "provider_subscription_id" text;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "charge_mode" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "installment_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "last_reminder_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_charges_client_idx" ON "payment_charges" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "payment_charges_due_status_idx" ON "payment_charges" USING btree ("organization_id","status","due_date");