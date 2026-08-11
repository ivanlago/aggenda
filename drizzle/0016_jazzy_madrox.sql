CREATE TABLE "organization_service_plans" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"core_plan_code" text DEFAULT 'core' NOT NULL,
	"whatsapp_service_code" text DEFAULT 'assisted' NOT NULL,
	"whatsapp_monthly_limit" integer DEFAULT 0 NOT NULL,
	"ai_monthly_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_usage_counters" (
	"organization_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"metric" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_usage_counters_organization_id_period_start_metric_pk" PRIMARY KEY("organization_id","period_start","metric")
);
--> statement-breakpoint
ALTER TABLE "organization_service_plans" ADD CONSTRAINT "organization_service_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_usage_counters" ADD CONSTRAINT "organization_usage_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_service_plans_core_idx" ON "organization_service_plans" USING btree ("core_plan_code");--> statement-breakpoint
CREATE INDEX "organization_usage_counters_period_idx" ON "organization_usage_counters" USING btree ("period_start","metric");