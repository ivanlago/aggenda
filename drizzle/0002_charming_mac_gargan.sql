CREATE TABLE "billing_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "billing_provider" text;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "billing_customer_id" text;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "billing_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "billing_checkout_id" text;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD COLUMN "last_payment_id" text;--> statement-breakpoint
CREATE INDEX "organization_subscriptions_billing_customer_idx" ON "organization_subscriptions" USING btree ("billing_customer_id");--> statement-breakpoint
CREATE INDEX "organization_subscriptions_billing_subscription_idx" ON "organization_subscriptions" USING btree ("billing_subscription_id");--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_billing_customer_id_unique" UNIQUE("billing_customer_id");--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_billing_subscription_id_unique" UNIQUE("billing_subscription_id");