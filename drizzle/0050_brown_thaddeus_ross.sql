ALTER TABLE "inventory_products" ADD COLUMN "consumption_quantity_millis" integer DEFAULT 0 NOT NULL;

UPDATE "inventory_products" AS product
SET "consumption_quantity_millis" = history."quantity_millis"
FROM (
  SELECT "product_id", SUM(ABS("quantity_millis"))::integer AS "quantity_millis"
  FROM "inventory_movements"
  WHERE "type" = 'consumption'
  GROUP BY "product_id"
) AS history
WHERE product."id" = history."product_id";
