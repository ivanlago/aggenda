CREATE TABLE "professional_fiscal_partnerships" (
	"professional_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"cpf" text,
	"cnpj" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_fiscal_shares" (
	"professional_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"percentage_basis_points" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "professional_fiscal_partnerships" ADD CONSTRAINT "professional_fiscal_partnerships_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_fiscal_partnerships" ADD CONSTRAINT "professional_fiscal_partnerships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_fiscal_shares" ADD CONSTRAINT "professional_fiscal_shares_professional_id_professional_fiscal_partnerships_professional_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professional_fiscal_partnerships"("professional_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_fiscal_shares" ADD CONSTRAINT "professional_fiscal_shares_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "professional_fiscal_share_service_unique" ON "professional_fiscal_shares" USING btree ("professional_id","service_id");