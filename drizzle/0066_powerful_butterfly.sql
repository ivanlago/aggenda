CREATE TABLE "document_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_artifacts_kind_check" CHECK ("document_artifacts"."kind" IN ('original', 'signed')),
	CONSTRAINT "document_artifacts_hash_check" CHECK ("document_artifacts"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "document_artifacts_size_check" CHECK ("document_artifacts"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_signature_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"external_event_id" text,
	"code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"signer_cpf" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"original_artifact_id" uuid NOT NULL,
	"signed_artifact_id" uuid,
	"method" text DEFAULT 'cloud' NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"certificate_fingerprint" text,
	"validated_at" timestamp,
	"failure_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_signature_requests_status_check" CHECK ("document_signature_requests"."status" IN ('PENDING', 'SIGNED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "document_signature_requests_method_check" CHECK ("document_signature_requests"."method" IN ('cloud', 'local_a1')),
	CONSTRAINT "document_signature_requests_cpf_check" CHECK ("document_signature_requests"."signer_cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "document_signature_requests_key_check" CHECK (length(trim("document_signature_requests"."idempotency_key")) BETWEEN 1 AND 128),
	CONSTRAINT "document_signature_requests_signed_check" CHECK ("document_signature_requests"."status" <> 'SIGNED' OR ("document_signature_requests"."signed_artifact_id" IS NOT NULL AND "document_signature_requests"."validated_at" IS NOT NULL AND "document_signature_requests"."certificate_fingerprint" IS NOT NULL AND "document_signature_requests"."provider" <> 'mock'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "document_artifacts_org_document_id_unique" ON "document_artifacts" USING btree ("organization_id","document_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_artifacts_storage_unique" ON "document_artifacts" USING btree ("organization_id","storage_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_signature_events_external_unique" ON "document_signature_events" USING btree ("organization_id","request_id","external_event_id");
--> statement-breakpoint
CREATE INDEX "document_signature_events_request_idx" ON "document_signature_events" USING btree ("organization_id","request_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_signature_requests_org_id_unique" ON "document_signature_requests" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_signature_requests_idempotency_unique" ON "document_signature_requests" USING btree ("organization_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_signature_requests_provider_unique" ON "document_signature_requests" USING btree ("provider","provider_id");
--> statement-breakpoint
CREATE INDEX "document_signature_requests_pending_idx" ON "document_signature_requests" USING btree ("organization_id","status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "electronic_documents_org_id_unique" ON "electronic_documents" USING btree ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "professionals_org_id_unique" ON "professionals" USING btree ("organization_id","id");
--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "artifacts_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."electronic_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_signature_events" ADD CONSTRAINT "signature_events_request_tenant_fk" FOREIGN KEY ("organization_id","request_id") REFERENCES "public"."document_signature_requests"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "document_signature_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "document_signature_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "signature_requests_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."electronic_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "signature_requests_professional_tenant_fk" FOREIGN KEY ("organization_id","professional_id") REFERENCES "public"."professionals"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "signature_requests_original_tenant_fk" FOREIGN KEY ("organization_id","document_id","original_artifact_id") REFERENCES "public"."document_artifacts"("organization_id","document_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "signature_requests_signed_tenant_fk" FOREIGN KEY ("organization_id","document_id","signed_artifact_id") REFERENCES "public"."document_artifacts"("organization_id","document_id","id") ON DELETE no action ON UPDATE no action;

