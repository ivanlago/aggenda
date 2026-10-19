CREATE TABLE "inventory_lot_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"pool" text NOT NULL,
	"quantity_millis" integer NOT NULL,
	"client_id" uuid,
	"appointment_id" uuid,
	"user_id" text,
	"reversed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_lot_allocation_positive" CHECK ("inventory_lot_allocations"."quantity_millis" > 0),
	CONSTRAINT "inventory_lot_allocation_pool" CHECK ("inventory_lot_allocations"."pool" IN ('sale','consumption'))
);
--> statement-breakpoint
CREATE TABLE "inventory_lot_recalls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "inventory_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"sale_quantity_millis" integer DEFAULT 0 NOT NULL,
	"consumption_quantity_millis" integer DEFAULT 0 NOT NULL,
	"supplier" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_lots_nonnegative" CHECK ("inventory_lots"."sale_quantity_millis" >= 0 AND "inventory_lots"."consumption_quantity_millis" >= 0),
	CONSTRAINT "inventory_lots_status" CHECK ("inventory_lots"."status" IN ('active','quarantine','recalled'))
);
--> statement-breakpoint
CREATE TABLE "inventory_recall_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recall_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"client_id" uuid,
	"appointment_id" uuid,
	"sale_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"updated_by_user_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_products" ADD COLUMN "lot_tracking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_lot_allocations" ADD CONSTRAINT "inventory_lot_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_allocations" ADD CONSTRAINT "inventory_lot_allocations_product_id_inventory_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_allocations" ADD CONSTRAINT "inventory_lot_allocations_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_allocations" ADD CONSTRAINT "inventory_lot_allocations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_allocations" ADD CONSTRAINT "inventory_lot_allocations_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_allocations" ADD CONSTRAINT "inventory_lot_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_recalls" ADD CONSTRAINT "inventory_lot_recalls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_recalls" ADD CONSTRAINT "inventory_lot_recalls_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_recalls" ADD CONSTRAINT "inventory_lot_recalls_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_inventory_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_recall_follow_ups" ADD CONSTRAINT "inventory_recall_follow_ups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_recall_follow_ups" ADD CONSTRAINT "inventory_recall_follow_ups_recall_id_inventory_lot_recalls_id_fk" FOREIGN KEY ("recall_id") REFERENCES "public"."inventory_lot_recalls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_recall_follow_ups" ADD CONSTRAINT "inventory_recall_follow_ups_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_recall_follow_ups" ADD CONSTRAINT "inventory_recall_follow_ups_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_recall_follow_ups" ADD CONSTRAINT "inventory_recall_follow_ups_sale_id_retail_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_recall_follow_ups" ADD CONSTRAINT "inventory_recall_follow_ups_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_lot_allocations_reference_idx" ON "inventory_lot_allocations" USING btree ("organization_id","reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "inventory_lot_allocations_lot_idx" ON "inventory_lot_allocations" USING btree ("organization_id","lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_lot_recalls_lot_unique" ON "inventory_lot_recalls" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "inventory_lot_recalls_org_idx" ON "inventory_lot_recalls" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_lots_product_code_unique" ON "inventory_lots" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "inventory_lots_org_expiry_idx" ON "inventory_lots" USING btree ("organization_id","expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_recall_source_unique" ON "inventory_recall_follow_ups" USING btree ("recall_id","source_key");--> statement-breakpoint
CREATE INDEX "inventory_recall_followups_org_idx" ON "inventory_recall_follow_ups" USING btree ("organization_id","recall_id");