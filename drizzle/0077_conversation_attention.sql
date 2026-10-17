ALTER TABLE "chat_conversations" ADD COLUMN "needs_human_attention" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "chat_conversations" SET "needs_human_attention" = true
WHERE "handoff_status" IN ('requested', 'human') AND "handoff_reason" LIKE 'IA:%';
