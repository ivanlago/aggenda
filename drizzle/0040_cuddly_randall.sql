ALTER TABLE "retail_sales" ADD COLUMN "receipt_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "receipt_email" text;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "receipt_phone" text;--> statement-breakpoint
CREATE UNIQUE INDEX "retail_sales_receipt_token_unique" ON "retail_sales" USING btree ("receipt_token");