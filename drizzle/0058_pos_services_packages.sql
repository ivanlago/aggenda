ALTER TABLE "retail_sale_items" ALTER COLUMN "variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ALTER COLUMN "inventory_product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "client_packages" ADD COLUMN "retail_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD COLUMN "service_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD COLUMN "package_id" uuid;--> statement-breakpoint
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_retail_sale_id_retail_sales_id_fk" FOREIGN KEY ("retail_sale_id") REFERENCES "public"."retail_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD CONSTRAINT "retail_sale_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;