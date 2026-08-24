ALTER TABLE "retail_product_variants" ADD COLUMN "is_for_sale" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_product_variants" ADD COLUMN "is_for_procedures" boolean DEFAULT true NOT NULL;--> statement-breakpoint
INSERT INTO "retail_products" ("id", "organization_id", "name", "is_active", "created_at", "updated_at")
SELECT ip."id", ip."organization_id", ip."name", ip."is_active", ip."created_at", ip."updated_at"
FROM "inventory_products" ip
WHERE NOT EXISTS (
	SELECT 1 FROM "retail_product_variants" rpv WHERE rpv."inventory_product_id" = ip."id"
)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "retail_product_variants" (
	"organization_id", "product_id", "inventory_product_id", "name", "sale_price_in_cents",
	"is_for_sale", "is_for_procedures", "is_active", "created_at", "updated_at"
)
SELECT ip."organization_id", ip."id", ip."id", 'Padrão', 0, false, true, ip."is_active", ip."created_at", ip."updated_at"
FROM "inventory_products" ip
WHERE NOT EXISTS (
	SELECT 1 FROM "retail_product_variants" rpv WHERE rpv."inventory_product_id" = ip."id"
)
ON CONFLICT ("inventory_product_id") DO NOTHING;
