CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'support', 'billing', 'operations', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."support_access_level" AS ENUM('read_only', 'operational');--> statement-breakpoint
ALTER TYPE "public"."organization_role" ADD VALUE 'manager' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."organization_role" ADD VALUE 'receptionist' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."organization_role" ADD VALUE 'professional' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."organization_role" ADD VALUE 'staff' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."organization_role" ADD VALUE 'viewer' BEFORE 'member';--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"user_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"verification_method" text,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_accounts_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "platform_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" "platform_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"access_level" "support_access_level" DEFAULT 'read_only' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_members" ADD CONSTRAINT "platform_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_members" ADD CONSTRAINT "platform_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_platform_user_id_users_id_fk" FOREIGN KEY ("platform_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_accounts_client_unique" ON "client_accounts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_accounts_organization_idx" ON "client_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "platform_members_role_idx" ON "platform_members" USING btree ("role");--> statement-breakpoint
CREATE INDEX "support_sessions_platform_user_idx" ON "support_sessions" USING btree ("platform_user_id");--> statement-breakpoint
CREATE INDEX "support_sessions_organization_idx" ON "support_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "support_sessions_expires_idx" ON "support_sessions" USING btree ("expires_at");