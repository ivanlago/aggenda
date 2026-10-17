CREATE TABLE "client_portal_dependents" (
	"organization_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_portal_dependents_organization_id_guardian_id_client_id_pk" PRIMARY KEY("organization_id","guardian_id","client_id"),
	CONSTRAINT "portal_dependent_not_self" CHECK ("client_portal_dependents"."guardian_id" <> "client_portal_dependents"."client_id")
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "public_repeat_policy" text DEFAULT 'warn' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_portal_dependents" ADD CONSTRAINT "client_portal_dependents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_dependents" ADD CONSTRAINT "portal_guardian_tenant_fk" FOREIGN KEY ("organization_id","guardian_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_portal_dependents" ADD CONSTRAINT "portal_dependent_tenant_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE cascade ON UPDATE no action;