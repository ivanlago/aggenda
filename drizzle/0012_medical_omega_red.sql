CREATE TABLE "client_history_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"entry_type" text DEFAULT 'note' NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "client_history_entries" ADD CONSTRAINT "client_history_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_history_entries" ADD CONSTRAINT "client_history_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_history_entries" ADD CONSTRAINT "client_history_entries_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_history_entries_client_idx" ON "client_history_entries" USING btree ("client_id","occurred_at");--> statement-breakpoint
CREATE INDEX "client_history_entries_org_idx" ON "client_history_entries" USING btree ("organization_id");