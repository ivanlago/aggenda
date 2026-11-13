CREATE TABLE professional_fiscal_outflows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 allocation_id uuid NOT NULL REFERENCES professional_fiscal_allocations(id) ON DELETE RESTRICT,
 financial_entry_id uuid NOT NULL REFERENCES financial_entries(id) ON DELETE RESTRICT,
 kind text NOT NULL, amount_in_cents integer NOT NULL,
 created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT fiscal_outflow_kind_check CHECK (kind IN ('net_transfer','tax_remittance') AND amount_in_cents > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX fiscal_outflow_entry_unique ON professional_fiscal_outflows(financial_entry_id);
--> statement-breakpoint
CREATE UNIQUE INDEX fiscal_outflow_allocation_kind_unique ON professional_fiscal_outflows(allocation_id,kind);
