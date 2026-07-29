ALTER TABLE "appointments" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "cancellation_reason";