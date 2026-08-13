CREATE TYPE "public"."crm_ai_insight_status" AS ENUM('draft', 'approved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."crm_proposal_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "crm_ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid,
	"opportunity_id" uuid,
	"conversation_id" uuid,
	"requested_by_user_id" text NOT NULL,
	"reviewed_by_user_id" text,
	"status" "crm_ai_insight_status" DEFAULT 'draft' NOT NULL,
	"summary" text NOT NULL,
	"intent" text,
	"urgency" integer DEFAULT 1 NOT NULL,
	"suggested_action" text,
	"suggested_reply" text,
	"model" text NOT NULL,
	"prompt_version" text DEFAULT 'crm-v1' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_custom_field_values" (
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_custom_field_values_lead_id_field_id_pk" PRIMARY KEY("lead_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "crm_custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"field_type" text DEFAULT 'text' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_lead_tags" (
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "crm_lead_tags_lead_id_tag_id_pk" PRIMARY KEY("lead_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "crm_proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_in_cents" integer NOT NULL,
	"total_in_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"status" "crm_proposal_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"valid_until" date,
	"subtotal_in_cents" integer NOT NULL,
	"discount_in_cents" integer DEFAULT 0 NOT NULL,
	"total_in_cents" integer NOT NULL,
	"sent_at" timestamp,
	"accepted_at" timestamp,
	"rejected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#37664f' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "assigned_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "handoff_status" text DEFAULT 'bot' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "handoff_reason" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "automation_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "handoff_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "handoff_resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_ai_insights" ADD CONSTRAINT "crm_ai_insights_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_ai_insights" ADD CONSTRAINT "crm_ai_insights_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_ai_insights" ADD CONSTRAINT "crm_ai_insights_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_ai_insights" ADD CONSTRAINT "crm_ai_insights_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_ai_insights" ADD CONSTRAINT "crm_ai_insights_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_ai_insights" ADD CONSTRAINT "crm_ai_insights_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_field_values" ADD CONSTRAINT "crm_custom_field_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_field_values" ADD CONSTRAINT "crm_custom_field_values_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_field_values" ADD CONSTRAINT "crm_custom_field_values_field_id_crm_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."crm_custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_custom_fields" ADD CONSTRAINT "crm_custom_fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_tags" ADD CONSTRAINT "crm_lead_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_tags" ADD CONSTRAINT "crm_lead_tags_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_tags" ADD CONSTRAINT "crm_lead_tags_tag_id_crm_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."crm_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_items" ADD CONSTRAINT "crm_proposal_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_items" ADD CONSTRAINT "crm_proposal_items_proposal_id_crm_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."crm_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_items" ADD CONSTRAINT "crm_proposal_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tags" ADD CONSTRAINT "crm_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_ai_insights_lead_idx" ON "crm_ai_insights" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_ai_insights_org_status_idx" ON "crm_ai_insights" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "crm_custom_values_org_idx" ON "crm_custom_field_values" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_custom_fields_org_name_unique" ON "crm_custom_fields" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "crm_lead_tags_org_idx" ON "crm_lead_tags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crm_proposal_items_proposal_idx" ON "crm_proposal_items" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_proposals_org_number_unique" ON "crm_proposals" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "crm_proposals_opportunity_idx" ON "crm_proposals" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "crm_proposals_org_status_idx" ON "crm_proposals" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_tags_org_name_unique" ON "crm_tags" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_lead_idx" ON "chat_conversations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_assigned_idx" ON "chat_conversations" USING btree ("assigned_user_id");