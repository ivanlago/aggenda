CREATE TABLE "clinical_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"title" text NOT NULL,
	"author_user_id" text NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_attachments_size_check" CHECK ("clinical_attachments"."size_bytes" > 0 AND "clinical_attachments"."size_bytes" <= 3145728)
);
--> statement-breakpoint
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_client_tenant_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_blob_tenant_fk" FOREIGN KEY ("organization_id","storage_key") REFERENCES "public"."document_signature_blobs"("organization_id","storage_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinical_attachments_client_idx" ON "clinical_attachments" USING btree ("organization_id","client_id","created_at");