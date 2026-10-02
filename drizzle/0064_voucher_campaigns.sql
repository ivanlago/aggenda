ALTER TABLE vouchers ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE TABLE voucher_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT, client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT, discount_in_cents integer NOT NULL CHECK (discount_in_cents >= 0),
 created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX voucher_redemptions_appointment_unique ON voucher_redemptions(appointment_id);
--> statement-breakpoint
CREATE INDEX voucher_redemptions_org_voucher_idx ON voucher_redemptions(organization_id, voucher_id);
--> statement-breakpoint
CREATE TABLE voucher_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT, client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 batch_id uuid NOT NULL, campaign_name text NOT NULL, channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
 recipient text NOT NULL, message text NOT NULL, booking_url text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, last_error text, provider_message_id text, sent_at timestamp,
 created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX voucher_deliveries_recipient_unique ON voucher_deliveries(voucher_id, client_id, channel);
--> statement-breakpoint
CREATE INDEX voucher_deliveries_org_status_idx ON voucher_deliveries(organization_id, status);
