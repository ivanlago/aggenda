ALTER TABLE "organization_service_plans" ADD COLUMN "nfse_service_code" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_service_plans" ADD COLUMN "nfse_monthly_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_service_plans" ADD COLUMN "nfse_overage_in_cents" integer DEFAULT 49 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_service_plans" ADD COLUMN "nfse_monthly_price_in_cents" integer DEFAULT 4990 NOT NULL;