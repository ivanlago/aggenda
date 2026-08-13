CREATE TABLE "financial_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"cost_center_id" uuid,
	"month" text NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_budgets" ADD CONSTRAINT "financial_budgets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_budgets" ADD CONSTRAINT "financial_budgets_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_budgets" ADD CONSTRAINT "financial_budgets_cost_center_id_financial_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."financial_cost_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_budgets" ADD CONSTRAINT "financial_budgets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_budgets_scope_unique" ON "financial_budgets" USING btree ("organization_id","category_id","cost_center_id","month");--> statement-breakpoint
CREATE INDEX "financial_budgets_org_month_idx" ON "financial_budgets" USING btree ("organization_id","month");