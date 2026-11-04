ALTER TABLE "electronic_documents" ADD COLUMN "professional_signature_image" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "team_permission_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "signature_image" text;