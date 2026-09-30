CREATE TABLE "attendance_package_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"client_package_id" uuid NOT NULL,
	"balance_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_package_items" ADD CONSTRAINT "attendance_package_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_package_items" ADD CONSTRAINT "attendance_package_items_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_package_items" ADD CONSTRAINT "attendance_package_items_client_package_id_client_packages_id_fk" FOREIGN KEY ("client_package_id") REFERENCES "public"."client_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_package_items" ADD CONSTRAINT "attendance_package_items_balance_id_client_package_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."client_package_balances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_package_items_balance_unique" ON "attendance_package_items" USING btree ("appointment_id","balance_id");--> statement-breakpoint
CREATE INDEX "attendance_package_items_org_idx" ON "attendance_package_items" USING btree ("organization_id");