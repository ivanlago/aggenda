CREATE TABLE "retail_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid,
	"client_name" text,
	"attendance_id" uuid,
	"created_by_user_id" text NOT NULL,
	"items" jsonb NOT NULL,
	"valid_until" date NOT NULL,
	"notes" text,
	"subtotal_in_cents" integer NOT NULL,
	"discount_in_cents" integer NOT NULL,
	"total_in_cents" integer NOT NULL,
	"sale_id" uuid,
	"converted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_history_entries" ADD COLUMN "retail_quote_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_quotes" ADD CONSTRAINT "retail_quotes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_quotes" ADD CONSTRAINT "retail_quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_quotes" ADD CONSTRAINT "retail_quotes_attendance_id_appointments_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_quotes" ADD CONSTRAINT "retail_quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_quotes" ADD CONSTRAINT "retail_quotes_sale_id_retail_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retail_quotes_org_created_idx" ON "retail_quotes" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "retail_quotes_sale_unique" ON "retail_quotes" USING btree ("sale_id");