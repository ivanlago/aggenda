CREATE TABLE "appointment_inventory_consumptions" (
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_millis" integer NOT NULL,
	"consumed_at" timestamp DEFAULT now() NOT NULL,
	"reversed_at" timestamp,
	CONSTRAINT "appointment_inventory_consumptions_appointment_id_product_id_pk" PRIMARY KEY("appointment_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"appointment_id" uuid,
	"type" text NOT NULL,
	"quantity_millis" integer NOT NULL,
	"balance_after_millis" integer NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"unit" text DEFAULT 'unit' NOT NULL,
	"current_quantity_millis" integer DEFAULT 0 NOT NULL,
	"minimum_quantity_millis" integer DEFAULT 0 NOT NULL,
	"cost_in_cents" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_inventory_items" (
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_millis" integer NOT NULL,
	CONSTRAINT "service_inventory_items_service_id_product_id_pk" PRIMARY KEY("service_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "appointment_inventory_consumptions" ADD CONSTRAINT "appointment_inventory_consumptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_inventory_consumptions" ADD CONSTRAINT "appointment_inventory_consumptions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_inventory_consumptions" ADD CONSTRAINT "appointment_inventory_consumptions_product_id_inventory_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_inventory_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_inventory_items" ADD CONSTRAINT "service_inventory_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_inventory_items" ADD CONSTRAINT "service_inventory_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_inventory_items" ADD CONSTRAINT "service_inventory_items_product_id_inventory_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_inventory_org_idx" ON "appointment_inventory_consumptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_product_idx" ON "inventory_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_org_idx" ON "inventory_movements" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_products_org_sku_unique" ON "inventory_products" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE INDEX "inventory_products_org_idx" ON "inventory_products" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "service_inventory_items_org_idx" ON "service_inventory_items" USING btree ("organization_id");