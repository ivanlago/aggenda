ALTER TABLE "client_history_entries" ADD COLUMN "electronic_document_id" uuid;--> statement-breakpoint
ALTER TABLE "electronic_documents" ADD COLUMN "structured_data" jsonb;--> statement-breakpoint
CREATE INDEX "client_history_entries_document_idx" ON "client_history_entries" USING btree ("electronic_document_id");