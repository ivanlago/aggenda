CREATE TABLE "pos_cash_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_closing_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_in_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pos_cash_adjustments_valid_check" CHECK ("pos_cash_adjustments"."kind" in ('supply', 'withdrawal') and "pos_cash_adjustments"."amount_in_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_closings" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_cash_adjustments" ADD CONSTRAINT "pos_cash_adjustments_cash_closing_id_cash_closings_id_fk" FOREIGN KEY ("cash_closing_id") REFERENCES "public"."cash_closings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_cash_adjustments" ADD CONSTRAINT "pos_cash_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_cash_adjustments_session_idx" ON "pos_cash_adjustments" USING btree ("cash_closing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_cash_one_open_per_operator" ON "cash_closings" USING btree ("organization_id","opened_by_user_id") WHERE "cash_closings"."account_id" is null and "cash_closings"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "cash_movements_session_time_idx" ON "cash_movements" USING btree ("cash_closing_id","occurred_at");
--> statement-breakpoint
CREATE FUNCTION aggenda_link_pos_cash_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original_session uuid;
  reversal_session uuid;
  payment_kind text;
BEGIN
  IF NEW.source_type <> 'sale_payment' OR NEW.cash_closing_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT c.id, p.method INTO original_session, payment_kind
  FROM retail_sale_payments p
  JOIN retail_sales s ON s.id = p.sale_id AND s.organization_id = p.organization_id
  LEFT JOIN cash_closings c ON c.id = s.cash_closing_id AND c.organization_id = s.organization_id AND c.account_id IS NULL
  WHERE p.id = NEW.source_id AND p.organization_id = NEW.organization_id;

  IF NEW.amount_in_cents < 0 AND payment_kind = 'cash' THEN
    reversal_session := nullif(current_setting('aggenda.pos_cash_reversal_session', true), '')::uuid;
    IF reversal_session IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM cash_closings c WHERE c.id = reversal_session AND c.organization_id = NEW.organization_id
        AND c.account_id IS NULL AND c.closed_at IS NULL
    ) THEN RAISE EXCEPTION 'Cash reversal requires an open POS session'; END IF;
  END IF;

  NEW.cash_closing_id := coalesce(reversal_session, original_session);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER link_pos_cash_movement BEFORE INSERT ON cash_movements
FOR EACH ROW EXECUTE FUNCTION aggenda_link_pos_cash_movement();
