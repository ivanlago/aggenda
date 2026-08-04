CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"plan_code" text,
	"payment_method" text,
	"amount_in_cents" integer,
	"status" text NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "billing_plan_code" text;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "billing_interval_months" integer;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "billing_payment_method" text;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "pending_period_months" integer;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payments_provider_id_unique" ON "billing_payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "billing_payments_org_idx" ON "billing_payments" USING btree ("organization_id");
--> statement-breakpoint
UPDATE "organization_subscriptions"
SET "trial_ends_at" = "created_at" + interval '30 days', "updated_at" = now()
WHERE "status" = 'trialing'
  AND ("trial_ends_at" IS NULL OR "trial_ends_at" < "created_at" + interval '30 days');
