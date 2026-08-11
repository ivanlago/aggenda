ALTER TABLE "whatsapp_channels" ADD COLUMN "verified_name" text;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD COLUMN "connection_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD COLUMN "encrypted_access_token" text;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD COLUMN "token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD COLUMN "connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD COLUMN "last_connection_error" text;