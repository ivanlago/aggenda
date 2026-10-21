CREATE TABLE "reference_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"code" text NOT NULL,
	"normalized_code" text NOT NULL,
	"name" text NOT NULL,
	"abbreviated_name" text,
	"laboratory" text,
	"presentation" text,
	"substance" text,
	"registration_status" text,
	"valid_from" date,
	"valid_until" date,
	"active" boolean DEFAULT true NOT NULL,
	"search_text" text NOT NULL,
	CONSTRAINT "reference_entries_dates_check" CHECK ("reference_entries"."valid_from" is null or "reference_entries"."valid_until" is null or "reference_entries"."valid_from" <= "reference_entries"."valid_until")
);
--> statement-breakpoint
CREATE TABLE "reference_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"source_url" text NOT NULL,
	"checksum" text NOT NULL,
	"source_modified_at" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_count" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "reference_releases_kind_check" CHECK ("reference_releases"."kind" in ('tuss-20','tuss-22','cid-10','anvisa-medications')),
	CONSTRAINT "reference_releases_count_check" CHECK ("reference_releases"."row_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "reference_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"message" text,
	"release_id" uuid,
	CONSTRAINT "reference_sync_runs_status_check" CHECK ("reference_sync_runs"."status" in ('running','success','unchanged','failed'))
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tuss_reference" jsonb;--> statement-breakpoint
ALTER TABLE "reference_entries" ADD CONSTRAINT "reference_entries_release_id_reference_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."reference_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_sync_runs" ADD CONSTRAINT "reference_sync_runs_release_id_reference_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."reference_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reference_entries_release_code_unique" ON "reference_entries" USING btree ("release_id","code");--> statement-breakpoint
CREATE INDEX "reference_entries_release_idx" ON "reference_entries" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "reference_entries_code_prefix_idx" ON "reference_entries" USING btree ("normalized_code" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "reference_entries_search_idx" ON "reference_entries" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE UNIQUE INDEX "reference_releases_kind_checksum_unique" ON "reference_releases" USING btree ("kind","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_releases_active_unique" ON "reference_releases" USING btree ("kind") WHERE "reference_releases"."active";--> statement-breakpoint
CREATE INDEX "reference_sync_runs_kind_started_idx" ON "reference_sync_runs" USING btree ("kind","started_at");