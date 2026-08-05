CREATE TABLE "financial_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"amount_in_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"realized_date" date,
	"payment_method" text,
	"notes" text,
	"client_id" uuid,
	"appointment_id" uuid,
	"client_package_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_entries_appointment_id_unique" UNIQUE("appointment_id"),
	CONSTRAINT "financial_entries_client_package_id_unique" UNIQUE("client_package_id")
);
--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_client_package_id_client_packages_id_fk" FOREIGN KEY ("client_package_id") REFERENCES "public"."client_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "financial_entries" (
	"organization_id", "type", "status", "source", "description", "category",
	"amount_in_cents", "due_date", "client_id", "appointment_id", "created_at", "updated_at"
)
SELECT
	a."organization_id", 'receivable',
	CASE WHEN a."status" = 'cancelled' THEN 'cancelled' ELSE 'pending' END,
	'appointment', s."name" || ' - ' || c."name", 'Atendimentos',
	a."price_in_cents", a."starts_at"::date, a."client_id", a."id", a."created_at", now()
FROM "appointments" a
INNER JOIN "services" s ON s."id" = a."service_id"
INNER JOIN "clients" c ON c."id" = a."client_id"
WHERE a."price_in_cents" > 0
ON CONFLICT ("appointment_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "financial_entries" (
	"organization_id", "type", "status", "source", "description", "category",
	"amount_in_cents", "due_date", "client_id", "client_package_id", "created_at", "updated_at"
)
SELECT
	cp."organization_id", 'receivable', 'pending', 'package',
	sp."name" || ' - ' || c."name", 'Pacotes', cp."price_in_cents",
	cp."purchased_at"::date, cp."client_id", cp."id", cp."created_at", now()
FROM "client_packages" cp
INNER JOIN "service_packages" sp ON sp."id" = cp."package_id"
INNER JOIN "clients" c ON c."id" = cp."client_id"
WHERE cp."price_in_cents" > 0
ON CONFLICT ("client_package_id") DO NOTHING;--> statement-breakpoint
CREATE INDEX "financial_entries_org_due_idx" ON "financial_entries" USING btree ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "financial_entries_org_realized_idx" ON "financial_entries" USING btree ("organization_id","realized_date");--> statement-breakpoint
CREATE INDEX "financial_entries_status_idx" ON "financial_entries" USING btree ("status");
