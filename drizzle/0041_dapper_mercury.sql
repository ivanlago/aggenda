CREATE TABLE "retail_sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retail_product_variants" ADD COLUMN "commission_rate_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD COLUMN "discount_in_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD COLUMN "unit_cost_in_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD COLUMN "commission_in_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "cancelled_by_user_id" text;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD CONSTRAINT "retail_sale_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_payments" ADD CONSTRAINT "retail_sale_payments_sale_id_retail_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retail_sale_payments_sale_idx" ON "retail_sale_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "retail_sale_payments_org_created_idx" ON "retail_sale_payments" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;