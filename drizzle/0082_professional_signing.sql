CREATE TABLE "professional_signing_ceremonies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"signer_cpf" text NOT NULL,
	"original_key" text NOT NULL,
	"original_hash" text NOT NULL,
	"otp_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"request_id" uuid,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signing_ceremony_state_check" CHECK ("professional_signing_ceremonies"."state" IN ('open', 'processing', 'consumed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "professional_signing_identities" (
	"organization_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"cpf" text NOT NULL,
	"verified_by" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "professional_signing_identities_organization_id_professional_id_pk" PRIMARY KEY("organization_id","professional_id"),
	CONSTRAINT "signing_identity_cpf_check" CHECK ("professional_signing_identities"."cpf" ~ '^[0-9]{11}$')
);
--> statement-breakpoint
ALTER TABLE "professional_signing_ceremonies" ADD CONSTRAINT "professional_signing_ceremonies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_signing_ceremonies" ADD CONSTRAINT "signing_ceremony_document_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."electronic_documents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_signing_ceremonies" ADD CONSTRAINT "signing_ceremony_professional_fk" FOREIGN KEY ("organization_id","professional_id") REFERENCES "public"."professionals"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_signing_ceremonies" ADD CONSTRAINT "signing_ceremony_request_fk" FOREIGN KEY ("organization_id","request_id") REFERENCES "public"."document_signature_requests"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_signing_identities" ADD CONSTRAINT "professional_signing_identities_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_signing_identities" ADD CONSTRAINT "signing_identity_professional_fk" FOREIGN KEY ("organization_id","professional_id") REFERENCES "public"."professionals"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signing_ceremony_user_idx" ON "professional_signing_ceremonies" USING btree ("organization_id","user_id","created_at");