-- Editable starting catalog, shared by existing and newly created organizations.
CREATE FUNCTION aggenda_seed_payment_defaults(org uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE bank_id uuid; safe_id uuid; destination uuid; method_id uuid; item record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payment-defaults:' || org::text, 0));
  SELECT id INTO bank_id FROM financial_accounts WHERE organization_id=org AND lower(name)='banco' ORDER BY created_at,id LIMIT 1;
  IF bank_id IS NULL THEN
    INSERT INTO financial_accounts(organization_id,name,account_type) VALUES(org,'banco','bank') RETURNING id INTO bank_id;
  END IF;
  SELECT id INTO safe_id FROM financial_accounts WHERE organization_id=org AND lower(name)='cofre' ORDER BY created_at,id LIMIT 1;
  IF safe_id IS NULL THEN
    INSERT INTO financial_accounts(organization_id,name,account_type) VALUES(org,'cofre','cash') RETURNING id INTO safe_id;
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('Boleto Bancário','boleto'), ('Cartão de Crédito','credit_card'),
    ('Cartão de Débito','debit_card'), ('Dinheiro','cash'), ('Pix','pix'),
    ('Transferência','bank_transfer'), ('Link de pagamento','link')
  ) AS defaults(name,kind) LOOP
    destination := CASE WHEN item.kind='cash' THEN safe_id ELSE bank_id END;
    method_id := NULL;
    SELECT id INTO method_id FROM payment_methods WHERE organization_id=org AND
      (lower(name)=lower(item.name) OR (item.kind='boleto' AND lower(name)='boleto'))
      ORDER BY (lower(name)=lower(item.name)) DESC,id LIMIT 1;
    IF method_id IS NULL THEN
      INSERT INTO payment_methods(organization_id,name,kind,provider,default_account_id)
      VALUES(org,item.name,item.kind,'manual',destination);
    ELSE
      -- Preserve explicit choices and integrations; only complete unassigned defaults.
      UPDATE payment_methods SET
        name=CASE WHEN provider='manual' THEN item.name ELSE name END,
        default_account_id=coalesce(default_account_id,destination)
      WHERE id=method_id;
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
SELECT aggenda_seed_payment_defaults(id) FROM organizations;
--> statement-breakpoint
CREATE FUNCTION aggenda_new_organization_payment_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM aggenda_seed_payment_defaults(NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organization_payment_defaults AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION aggenda_new_organization_payment_defaults();
