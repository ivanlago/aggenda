CREATE TABLE "nfse_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "encrypted_cancellation" text;--> statement-breakpoint
ALTER TABLE "nfse_requests" ADD COLUMN "encrypted_event" text;--> statement-breakpoint
ALTER TABLE "nfse_request_events" ADD CONSTRAINT "nfse_request_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfse_request_events" ADD CONSTRAINT "nfse_request_events_request_id_nfse_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."nfse_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nfse_events_request_idx" ON "nfse_request_events" USING btree ("organization_id","request_id","created_at");