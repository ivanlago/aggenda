ALTER TABLE "financial_entries" ADD COLUMN "attendance_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "attendance_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_attendance_id_appointments_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;