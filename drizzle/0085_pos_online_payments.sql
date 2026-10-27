ALTER TABLE "organization_financial_integrations" ADD COLUMN "is_default_pos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "payment_provider" text;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "checkout_key" uuid;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "checkout_input_hash" text;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "stock_restored_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_integrations_pos_default_unique" ON "organization_financial_integrations" USING btree ("organization_id") WHERE "organization_financial_integrations"."is_default_pos" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "retail_sales_checkout_unique" ON "retail_sales" USING btree ("organization_id","checkout_key");