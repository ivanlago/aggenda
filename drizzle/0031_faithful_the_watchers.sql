ALTER TABLE "client_clinical_media" ADD COLUMN "storage_provider" text DEFAULT 'external' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "storage_asset_id" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "storage_public_id" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "bytes" integer;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "annotations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "parent_media_id" uuid;