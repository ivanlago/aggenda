CREATE TABLE "nfse_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"financial_entry_id" uuid NOT NULL,
	"sequence" bigserial NOT NULL,
	"environment" text NOT NULL,
	"cnpj" text NOT NULL,
	"dps_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"encrypted_draft" text NOT NULL,
	"encrypted_dps" text,
	"encrypted_xml" text,
	"access_key" text,
	"number" text,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD CONSTRAINT "nfse_requests_financial_entry_id_financial_entries_id_fk" FOREIGN KEY ("financial_entry_id") REFERENCES "public"."financial_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nfse_requests_entry_environment_unique" ON "nfse_requests" USING btree ("organization_id","environment","financial_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nfse_requests_dps_unique" ON "nfse_requests" USING btree ("environment","dps_id");--> statement-breakpoint
CREATE INDEX "nfse_requests_org_idx" ON "nfse_requests" USING btree ("organization_id","created_at");