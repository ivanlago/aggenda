ALTER TABLE retail_sale_payments
  ADD COLUMN card_installments integer CHECK (card_installments BETWEEN 1 AND 99),
  ADD COLUMN buyer_surcharge_in_cents integer CHECK (buyer_surcharge_in_cents >= 0);
