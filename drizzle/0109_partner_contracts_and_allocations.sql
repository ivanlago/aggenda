ALTER TABLE professional_fiscal_partnerships ADD COLUMN contract jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE professional_fiscal_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 professional_id uuid NOT NULL REFERENCES professional_fiscal_partnerships(professional_id) ON DELETE RESTRICT,
 financial_entry_id uuid NOT NULL REFERENCES financial_entries(id) ON DELETE RESTRICT,
 service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
 received_on date NOT NULL, gross_in_cents integer NOT NULL,
 percentage_basis_points integer NOT NULL, partner_in_cents integer NOT NULL, salon_in_cents integer NOT NULL,
 withheld_in_cents integer NOT NULL DEFAULT 0, withholding_description text NOT NULL DEFAULT '',
 consumer_invoice text NOT NULL DEFAULT '', partner_invoice text NOT NULL DEFAULT '', snapshot jsonb NOT NULL,
 void_reason text, voided_at timestamp, created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT fiscal_allocation_balanced CHECK (gross_in_cents > 0 AND partner_in_cents >= 0 AND salon_in_cents >= 0 AND gross_in_cents::bigint = partner_in_cents::bigint + salon_in_cents::bigint AND withheld_in_cents >= 0 AND withheld_in_cents <= partner_in_cents AND percentage_basis_points BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE INDEX fiscal_allocations_org_period_idx ON professional_fiscal_allocations(organization_id,received_on);
--> statement-breakpoint
CREATE UNIQUE INDEX fiscal_allocation_source_unique ON professional_fiscal_allocations(financial_entry_id,professional_id,service_id) WHERE voided_at IS NULL;
