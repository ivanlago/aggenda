ALTER TABLE "organizations" ADD COLUMN "cancellation_policy" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deposit_refund_policy" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "lateness_policy" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_privacy_policy" text;