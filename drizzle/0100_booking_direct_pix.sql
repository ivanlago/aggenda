ALTER TABLE "organizations" ADD COLUMN "booking_payment_settings" jsonb DEFAULT '{"mode":"integrated"}'::jsonb NOT NULL;
