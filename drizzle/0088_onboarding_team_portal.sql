ALTER TABLE "organizations" ADD COLUMN "booking_first_published_at" timestamp;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "agenda_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "hide_public_price" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_signed_in_at" timestamp;