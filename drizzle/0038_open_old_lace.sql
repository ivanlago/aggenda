CREATE TABLE "retail_product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"inventory_product_id" uuid NOT NULL,
	"name" text DEFAULT 'Padrão' NOT NULL,
	"barcode" text,
	"sale_price_in_cents" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"inventory_product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"variant_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_in_cents" integer NOT NULL,
	"total_in_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid,
	"financial_entry_id" uuid,
	"status" text DEFAULT 'completed' NOT NULL,
	"payment_method" text,
	"subtotal_in_cents" integer NOT NULL,
	"discount_in_cents" integer DEFAULT 0 NOT NULL,
	"total_in_cents" integer NOT NULL,
	"notes" text,
	"sold_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "retail_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_product_variants" ADD CONSTRAINT "retail_product_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_product_variants" ADD CONSTRAINT "retail_product_variants_product_id_retail_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."retail_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_product_variants" ADD CONSTRAINT "retail_product_variants_inventory_product_id_inventory_products_id_fk" FOREIGN KEY ("inventory_product_id") REFERENCES "public"."inventory_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_products" ADD CONSTRAINT "retail_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD CONSTRAINT "retail_sale_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD CONSTRAINT "retail_sale_items_sale_id_retail_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD CONSTRAINT "retail_sale_items_variant_id_retail_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."retail_product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD CONSTRAINT "retail_sale_items_inventory_product_id_inventory_products_id_fk" FOREIGN KEY ("inventory_product_id") REFERENCES "public"."inventory_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_financial_entry_id_financial_entries_id_fk" FOREIGN KEY ("financial_entry_id") REFERENCES "public"."financial_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retail_variants_inventory_unique" ON "retail_product_variants" USING btree ("inventory_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retail_variants_org_barcode_unique" ON "retail_product_variants" USING btree ("organization_id","barcode");--> statement-breakpoint
CREATE INDEX "retail_variants_product_idx" ON "retail_product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "retail_products_org_idx" ON "retail_products" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "retail_sale_items_sale_idx" ON "retail_sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "retail_sales_org_sold_idx" ON "retail_sales" USING btree ("organization_id","sold_at");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_retail_sale_id_retail_sales_id_fk" FOREIGN KEY ("retail_sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE set null ON UPDATE no action;