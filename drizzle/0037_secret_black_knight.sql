ALTER TABLE "document_templates" ADD COLUMN "response_schema" jsonb;--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "service_id" uuid;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;