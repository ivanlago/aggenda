CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_type" text DEFAULT 'bank' NOT NULL,
	"opening_balance_in_cents" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "recurrence_group_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "installment_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD COLUMN "installment_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_cost_centers" ADD CONSTRAINT "financial_cost_centers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_org_name_unique" ON "financial_accounts" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_categories_org_type_name_unique" ON "financial_categories" USING btree ("organization_id","type","name");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_cost_centers_org_name_unique" ON "financial_cost_centers" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_cost_center_id_financial_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."financial_cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_entries_account_idx" ON "financial_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "financial_entries_category_idx" ON "financial_entries" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "financial_entries_recurrence_idx" ON "financial_entries" USING btree ("recurrence_group_id");