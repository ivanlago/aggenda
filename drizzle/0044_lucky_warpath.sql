ALTER TABLE "client_portal_access_requests" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "client_portal_access_requests" ADD COLUMN "pending_name" text;--> statement-breakpoint
ALTER TABLE "client_portal_access_requests" ADD COLUMN "pending_phone" text;