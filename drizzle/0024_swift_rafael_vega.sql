CREATE TABLE "organization_implementation_preferences" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"implementation_mode" text DEFAULT 'guided_free' NOT NULL,
	"implementation_status" text DEFAULT 'not_required' NOT NULL,
	"fiscal_setup_mode" text DEFAULT 'none' NOT NULL,
	"fiscal_setup_status" text DEFAULT 'not_required' NOT NULL,
	"requested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_implementation_preferences" ADD CONSTRAINT "organization_implementation_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_implementation_preferences_status_idx" ON "organization_implementation_preferences" USING btree ("implementation_status","fiscal_setup_status");