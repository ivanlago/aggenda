CREATE TABLE "professional_google_calendar_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"google_email" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "professional_google_calendar_accounts_professional_id_unique" UNIQUE("professional_id")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "google_calendar_event_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "google_calendar_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "google_calendar_sync_status" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "google_calendar_sync_error" text;--> statement-breakpoint
ALTER TABLE "professional_google_calendar_accounts" ADD CONSTRAINT "professional_google_calendar_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_google_calendar_accounts" ADD CONSTRAINT "professional_google_calendar_accounts_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professional_google_calendar_org_idx" ON "professional_google_calendar_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "professional_google_calendar_professional_idx" ON "professional_google_calendar_accounts" USING btree ("professional_id");