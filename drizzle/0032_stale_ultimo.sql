CREATE TYPE "public"."electronic_document_status" AS ENUM('pending', 'viewed', 'signed', 'refused', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"document_type" text DEFAULT 'consent' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electronic_document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electronic_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"template_id" uuid,
	"created_by_user_id" text,
	"document_type" text NOT NULL,
	"title" text NOT NULL,
	"content_snapshot" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" "electronic_document_status" DEFAULT 'pending' NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"verification_code_hash" text NOT NULL,
	"verification_expires_at" timestamp NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"verification_attempts" integer DEFAULT 0 NOT NULL,
	"viewed_at" timestamp,
	"signed_at" timestamp,
	"refused_at" timestamp,
	"cancelled_at" timestamp,
	"signature_data" text,
	"acceptance_text" text,
	"signer_ip_address" text,
	"signer_user_agent" text,
	"evidence_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "electronic_documents_access_token_hash_unique" UNIQUE("access_token_hash")
);
--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_document_events" ADD CONSTRAINT "electronic_document_events_document_id_electronic_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."electronic_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_document_events" ADD CONSTRAINT "electronic_document_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_templates_org_idx" ON "document_templates" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "electronic_document_events_document_idx" ON "electronic_document_events" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "electronic_documents_org_idx" ON "electronic_documents" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "electronic_documents_client_idx" ON "electronic_documents" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "electronic_documents_status_idx" ON "electronic_documents" USING btree ("organization_id","status");