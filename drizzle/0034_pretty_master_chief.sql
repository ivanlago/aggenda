ALTER TYPE "public"."electronic_document_status" ADD VALUE 'issued' BEFORE 'refused';--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "workflow_type" text DEFAULT 'patient_signature' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "is_system_preset" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD COLUMN "issuer_professional_id" uuid;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD COLUMN "workflow_type" text DEFAULT 'patient_signature' NOT NULL;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD COLUMN "issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_website" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_whatsapp" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "document_footer" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tuss_code" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tuss_table" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tuss_name" text;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_issuer_professional_id_professionals_id_fk" FOREIGN KEY ("issuer_professional_id") REFERENCES "public"."professionals"("id") ON DELETE set null ON UPDATE no action;