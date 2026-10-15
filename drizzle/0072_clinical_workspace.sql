CREATE TABLE "clinical_consultation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"kind" text NOT NULL,
	"parent_record_id" uuid,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_records_kind_check" CHECK (("clinical_consultation_records"."kind" = 'evolution' AND "clinical_consultation_records"."parent_record_id" IS NULL) OR ("clinical_consultation_records"."kind" = 'addendum' AND "clinical_consultation_records"."parent_record_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "clinical_summary_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_records_request_unique" ON "clinical_consultation_records" USING btree ("organization_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_records_tenant_id_unique" ON "clinical_consultation_records" USING btree ("organization_id","client_id","appointment_id","id");--> statement-breakpoint
CREATE INDEX "clinical_records_client_idx" ON "clinical_consultation_records" USING btree ("organization_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "clinical_summary_client_idx" ON "clinical_summary_versions" USING btree ("organization_id","client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_org_client_id_unique" ON "appointments" USING btree ("organization_id","client_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_org_id_unique" ON "clients" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "clinical_consultation_records" ADD CONSTRAINT "clinical_consultation_records_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_consultation_records" ADD CONSTRAINT "clinical_records_appointment_tenant_fk" FOREIGN KEY ("organization_id","client_id","appointment_id") REFERENCES "public"."appointments"("organization_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_consultation_records" ADD CONSTRAINT "clinical_records_parent_tenant_fk" FOREIGN KEY ("organization_id","client_id","appointment_id","parent_record_id") REFERENCES "public"."clinical_consultation_records"("organization_id","client_id","appointment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_summary_versions" ADD CONSTRAINT "clinical_summary_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_summary_versions" ADD CONSTRAINT "clinical_summary_client_tenant_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION preserve_clinical_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro clinico preservado: registre nova revisao ou adendo.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER clinical_summary_append_only BEFORE UPDATE OR DELETE ON clinical_summary_versions
FOR EACH ROW EXECUTE FUNCTION preserve_clinical_snapshot();
--> statement-breakpoint
CREATE TRIGGER clinical_consultation_append_only BEFORE UPDATE OR DELETE ON clinical_consultation_records
FOR EACH ROW EXECUTE FUNCTION preserve_clinical_snapshot();
