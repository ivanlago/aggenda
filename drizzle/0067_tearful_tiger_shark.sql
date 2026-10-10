CREATE TABLE "document_signature_blobs" (
	"organization_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"encrypted_content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_signature_blobs_organization_id_storage_key_pk" PRIMARY KEY("organization_id","storage_key")
);
--> statement-breakpoint
ALTER TABLE "document_signature_blobs" ADD CONSTRAINT "document_signature_blobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;