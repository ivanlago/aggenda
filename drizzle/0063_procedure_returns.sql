ALTER TABLE "services" ADD COLUMN "return_interval" integer;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "return_interval_unit" text DEFAULT 'days' NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "return_reminder_days" integer DEFAULT 7 NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_return_settings_check" CHECK (("return_interval" IS NULL OR "return_interval" BETWEEN 1 AND 3650) AND "return_interval_unit" IN ('days', 'months') AND "return_reminder_days" BETWEEN 0 AND 365);
--> statement-breakpoint
CREATE TABLE "procedure_returns" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "organization_id" uuid NOT NULL CONSTRAINT "procedure_returns_organization_id_organizations_id_fk" REFERENCES "organizations"("id") ON DELETE CASCADE,
 "appointment_id" uuid NOT NULL CONSTRAINT "procedure_returns_appointment_id_appointments_id_fk" REFERENCES "appointments"("id") ON DELETE CASCADE,
 "client_id" uuid NOT NULL CONSTRAINT "procedure_returns_client_id_clients_id_fk" REFERENCES "clients"("id") ON DELETE RESTRICT,
 "service_id" uuid NOT NULL CONSTRAINT "procedure_returns_service_id_services_id_fk" REFERENCES "services"("id") ON DELETE RESTRICT,
 "performed_at" timestamp NOT NULL,
 "due_date" date,
 "reminder_days" integer DEFAULT 7 NOT NULL CONSTRAINT "procedure_returns_reminder_days_check" CHECK ("reminder_days" BETWEEN 0 AND 365),
 "contact_status" text DEFAULT 'pending' NOT NULL CONSTRAINT "procedure_returns_contact_status_check" CHECK ("contact_status" IN ('pending', 'contacted', 'dismissed')),
 "contacted_at" timestamp,
 "contact_note" text,
 "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_returns_appointment_service_unique" ON "procedure_returns"("appointment_id", "service_id");
--> statement-breakpoint
CREATE INDEX "procedure_returns_org_due_idx" ON "procedure_returns"("organization_id", "due_date");
--> statement-breakpoint
CREATE INDEX "procedure_returns_client_service_idx" ON "procedure_returns"("organization_id", "client_id", "service_id");
