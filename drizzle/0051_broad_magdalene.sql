ALTER TABLE "client_clinical_media" ADD COLUMN "capture_session" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "body_region" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "view_code" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "patient_position" text;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "consent_purpose" text DEFAULT 'clinical' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD COLUMN "source_media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "client_clinical_media_pair_idx" ON "client_clinical_media" USING btree ("client_id","capture_session","body_region","view_code","phase");