CREATE TABLE "service_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  CONSTRAINT "service_categories_name_check" CHECK (length(trim("name")) BETWEEN 2 AND 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_org_id_unique" ON "service_categories" ("organization_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_org_name_unique" ON "service_categories" ("organization_id", lower(trim("name")));
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "category_id" uuid;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_tenant_fk" FOREIGN KEY ("organization_id", "category_id") REFERENCES "service_categories" ("organization_id", "id");
--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" ("organization_id", "category_id");
