CREATE TABLE "clinical_consultation_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_drafts_status_check" CHECK ("clinical_consultation_drafts"."status" IN ('active', 'finalized', 'discarded')),
	CONSTRAINT "clinical_drafts_version_check" CHECK ("clinical_consultation_drafts"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "clinical_consultation_drafts" ADD CONSTRAINT "clinical_consultation_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_consultation_drafts" ADD CONSTRAINT "clinical_drafts_appointment_tenant_fk" FOREIGN KEY ("organization_id","client_id","appointment_id") REFERENCES "public"."appointments"("organization_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_drafts_active_unique" ON "clinical_consultation_drafts" USING btree ("organization_id","appointment_id","user_id") WHERE "clinical_consultation_drafts"."status" = 'active';