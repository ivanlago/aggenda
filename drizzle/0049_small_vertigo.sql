CREATE TABLE "inventory_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retail_products" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_products" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_subcategories" ADD CONSTRAINT "inventory_subcategories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_subcategories" ADD CONSTRAINT "inventory_subcategories_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_categories_org_name_unique" ON "inventory_categories" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "inventory_categories_org_idx" ON "inventory_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_subcategories_category_name_unique" ON "inventory_subcategories" USING btree ("category_id","name");--> statement-breakpoint
CREATE INDEX "inventory_subcategories_org_idx" ON "inventory_subcategories" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "retail_products" ADD CONSTRAINT "retail_products_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_products" ADD CONSTRAINT "retail_products_subcategory_id_inventory_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."inventory_subcategories"("id") ON DELETE set null ON UPDATE no action;