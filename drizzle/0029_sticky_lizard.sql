CREATE TABLE "client_clinical_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid,
	"author_user_id" text NOT NULL,
	"media_type" text DEFAULT 'photo' NOT NULL,
	"phase" text DEFAULT 'clinical' NOT NULL,
	"title" text,
	"url" text NOT NULL,
	"consent_confirmed" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"monthly_price_in_cents" integer NOT NULL,
	"billing_day" integer DEFAULT 1 NOT NULL,
	"provider_subscription_id" text,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"next_renewal_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" text DEFAULT 'fixed' NOT NULL,
	"discount_value" integer NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "deposit_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "deposit_amount_in_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "reservation_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "public_manage_token" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_description" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_address" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_logo_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "public_cover_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "brand_color" text DEFAULT '#37664f' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "custom_domain_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reminder_offsets_hours" jsonb DEFAULT '[24]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "reminder_confirmation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "patient_recovery_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "estimated_cost_in_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "deposit_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "deposit_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "deposit_expiration_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD CONSTRAINT "client_clinical_media_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD CONSTRAINT "client_clinical_media_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD CONSTRAINT "client_clinical_media_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_clinical_media" ADD CONSTRAINT "client_clinical_media_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_package_id_service_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."service_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_clinical_media_client_idx" ON "client_clinical_media" USING btree ("client_id","captured_at");--> statement-breakpoint
CREATE INDEX "client_clinical_media_org_idx" ON "client_clinical_media" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_memberships_org_status_idx" ON "client_memberships" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "client_memberships_client_idx" ON "client_memberships" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_org_code_unique" ON "vouchers" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "vouchers_org_active_idx" ON "vouchers" USING btree ("organization_id","is_active");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_public_manage_token_unique" UNIQUE("public_manage_token");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_custom_domain_unique" UNIQUE("custom_domain");