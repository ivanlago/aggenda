CREATE TABLE "commercial_contracts" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"kind" text NOT NULL,
	"product" text NOT NULL,
	"professional_limit" integer NOT NULL,
	"response_limit" integer NOT NULL,
	"document_limit" integer NOT NULL,
	"note_limit" integer NOT NULL,
	"started_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid,
	"quote" jsonb NOT NULL,
	"checkout_id" text,
	"provider_payment_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"activated_at" timestamp,
	"period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_orders_checkout_id_unique" UNIQUE("checkout_id"),
	CONSTRAINT "commercial_orders_provider_payment_id_unique" UNIQUE("provider_payment_id")
);
--> statement-breakpoint
CREATE TABLE "commercial_usage" (
	"organization_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"resource_id" text NOT NULL,
	"period_start" date NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_usage_organization_id_metric_resource_id_pk" PRIMARY KEY("organization_id","metric","resource_id")
);
--> statement-breakpoint
CREATE TABLE "pilot_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"organization_id" uuid,
	"redeemed_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_order_id_commercial_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commercial_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_orders" ADD CONSTRAINT "commercial_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_orders" ADD CONSTRAINT "commercial_orders_invitation_id_pilot_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."pilot_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_usage" ADD CONSTRAINT "commercial_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_invitations" ADD CONSTRAINT "pilot_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_invitations" ADD CONSTRAINT "pilot_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commercial_usage_period_idx" ON "commercial_usage" USING btree ("organization_id","period_start","metric");