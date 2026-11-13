ALTER TABLE "retail_sales" ADD COLUMN "commission_deduct_cost" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "commission_cost_in_cents" integer;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION aggenda_sync_sale_commissions(sale_id_input uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE sale retail_sales%ROWTYPE; line retail_sale_items%ROWTYPE; prior commission_entries%ROWTYPE;
  org_timezone text; beneficiary text; kind text; item uuid; rate integer; target integer; refund_total bigint;
  paid_total bigint; delta integer; adjustment_id uuid; period text;
  assessment_base integer; fee_share integer; running_net numeric:=0; cost_share integer; running_weight numeric:=0; total_weight numeric; item_weight numeric;
BEGIN
  SELECT * INTO sale FROM retail_sales WHERE id=sale_id_input;
  IF NOT FOUND OR sale.commission_billed_at IS NULL THEN RETURN; END IF;
  IF (SELECT commission_policy_version FROM organizations WHERE id=sale.organization_id)<>2 THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commission-ledger:'||sale.organization_id::text,0));
  IF sale.commission_professional_id IS NULL AND sale.commission_user_id IS NULL THEN RETURN; END IF;
  SELECT timezone INTO org_timezone FROM organizations WHERE id=sale.organization_id;
  beneficiary:=COALESCE(sale.commission_user_id,(SELECT user_id FROM professionals WHERE id=sale.commission_professional_id AND organization_id=sale.organization_id));
  SELECT COALESCE(sum(refunded_in_cents),0) INTO refund_total FROM retail_sale_payments WHERE sale_id=sale.id AND organization_id=sale.organization_id;
  period:=to_char(sale.commission_billed_at AT TIME ZONE 'UTC' AT TIME ZONE org_timezone,'YYYY-MM');
  SELECT sum(CASE WHEN sale.total_in_cents>0 THEN total_in_cents ELSE total_in_cents+discount_in_cents END) INTO total_weight FROM retail_sale_items WHERE sale_id=sale.id AND organization_id=sale.organization_id;
  FOR line IN SELECT * FROM retail_sale_items WHERE sale_id=sale.id AND organization_id=sale.organization_id ORDER BY id LOOP
    fee_share:=0;
    IF sale.commission_deduct_fees AND sale.commission_fee_in_cents IS NOT NULL AND sale.total_in_cents>0 THEN
      fee_share:=(floor((running_net+line.total_in_cents)::numeric*sale.commission_fee_in_cents/sale.total_in_cents)-floor(running_net*sale.commission_fee_in_cents/sale.total_in_cents))::integer;
    END IF;
    running_net:=running_net+line.total_in_cents;
    item_weight:=CASE WHEN sale.total_in_cents>0 THEN line.total_in_cents ELSE line.total_in_cents+line.discount_in_cents END;
    cost_share:=0;
    IF sale.commission_deduct_cost AND total_weight>0 THEN
      cost_share:=(floor((running_weight+item_weight)*sale.commission_cost_in_cents/total_weight)-floor(running_weight*sale.commission_cost_in_cents/total_weight))::integer;
    END IF;
    running_weight:=running_weight+item_weight;
    assessment_base:=greatest(0,line.total_in_cents+CASE WHEN sale.commission_deduct_discount THEN 0 ELSE line.discount_in_cents END-fee_share-cost_share);
    kind:=CASE WHEN line.kit_id IS NOT NULL THEN 'kit' WHEN line.package_id IS NOT NULL THEN 'package' WHEN line.variant_id IS NOT NULL THEN 'product' ELSE 'service' END;
    item:=COALESCE(line.kit_id,line.package_id,line.variant_id,line.service_id);
    IF item IS NULL THEN CONTINUE; END IF;
    rate:=COALESCE(line.commission_rate_basis_points,aggenda_item_commission_rate(sale.organization_id,beneficiary,kind,item));
    IF line.commission_rate_basis_points IS NULL THEN
      UPDATE retail_sale_items SET commission_rate_basis_points=rate,commission_in_cents=round(total_in_cents::numeric*rate/10000)::integer WHERE id=line.id;
      line.commission_in_cents:=round(line.total_in_cents::numeric*rate/10000)::integer;
    END IF;
    line.commission_in_cents:=round(assessment_base::numeric*rate/10000)::integer;
    target:=CASE WHEN sale.status IN ('cancelled','refunded') THEN 0 WHEN sale.total_in_cents=0 THEN line.commission_in_cents ELSE round(line.commission_in_cents::numeric*greatest(0,sale.total_in_cents-refund_total)/greatest(1,sale.total_in_cents))::integer END;
    -- A previously commissioned attendance must never earn the same main service twice.
    IF sale.attendance_id IS NOT NULL AND line.variant_name IN ('Serviço realizado','Procedimento realizado') AND EXISTS(SELECT 1 FROM commission_entries WHERE organization_id=sale.organization_id AND appointment_id=sale.attendance_id AND status<>'cancelled') THEN target:=0; END IF;
    SELECT * INTO prior FROM commission_entries WHERE organization_id=sale.organization_id AND source_key='billed:'||line.id::text;
    IF NOT FOUND THEN
      IF target>0 THEN INSERT INTO commission_entries(organization_id,professional_id,beneficiary_user_id,sale_id,sale_item_id,source_key,source_type,description,calculation_type,calculation_value,base_amount_in_cents,amount_in_cents,competence)
        VALUES(sale.organization_id,sale.commission_professional_id,sale.commission_user_id,sale.id,line.id,'billed:'||line.id::text,kind,line.product_name||' · '||line.quantity||' un.','percentage',rate,assessment_base,target,period); END IF;
    ELSIF prior.status<>'paid' THEN
      IF prior.professional_id IS DISTINCT FROM sale.commission_professional_id OR prior.beneficiary_user_id IS DISTINCT FROM sale.commission_user_id THEN RAISE EXCEPTION 'Commission beneficiary is frozen'; END IF;
      UPDATE commission_entries SET base_amount_in_cents=assessment_base,amount_in_cents=target,status=CASE WHEN target=0 THEN 'cancelled' ELSE 'pending' END,updated_at=now() WHERE id=prior.id;
    ELSE
      SELECT prior.amount_in_cents+COALESCE(sum(amount_in_cents),0) INTO paid_total FROM commission_entries WHERE original_entry_id=prior.id AND status='paid';
      delta:=target-paid_total;
      SELECT id INTO adjustment_id FROM commission_entries WHERE original_entry_id=prior.id AND status='pending' ORDER BY created_at LIMIT 1;
      IF adjustment_id IS NOT NULL THEN UPDATE commission_entries SET amount_in_cents=delta,status=CASE WHEN delta=0 THEN 'cancelled' ELSE 'pending' END,updated_at=now() WHERE id=adjustment_id;
      ELSIF delta<>0 THEN INSERT INTO commission_entries(organization_id,professional_id,beneficiary_user_id,sale_id,sale_item_id,source_key,source_type,description,calculation_type,calculation_value,original_entry_id,base_amount_in_cents,amount_in_cents,competence)
        VALUES(sale.organization_id,prior.professional_id,prior.beneficiary_user_id,sale.id,line.id,'billed-adjustment:'||gen_random_uuid()::text,'adjustment','Ajuste · '||line.product_name,'snapshot',delta,prior.id,line.total_in_cents,delta,to_char(now() AT TIME ZONE org_timezone,'YYYY-MM')); END IF;
    END IF;
  END LOOP;
END $$;


--> statement-breakpoint
ALTER TABLE retail_sales ADD CONSTRAINT commission_assessment_cost_valid CHECK ((commission_cost_in_cents IS NULL OR commission_cost_in_cents>=0) AND (NOT commission_deduct_cost OR commission_cost_in_cents IS NOT NULL));
--> statement-breakpoint
DROP TRIGGER commission_assessment_guard ON retail_sales;
--> statement-breakpoint
DROP TRIGGER commission_assessment_sync ON retail_sales;
--> statement-breakpoint
CREATE TRIGGER commission_assessment_guard BEFORE UPDATE OF commission_deduct_discount,commission_deduct_fees,commission_fee_in_cents,commission_deduct_cost,commission_cost_in_cents ON retail_sales FOR EACH ROW EXECUTE FUNCTION aggenda_guard_commission_assessment();
--> statement-breakpoint
CREATE TRIGGER commission_assessment_sync AFTER UPDATE OF commission_deduct_discount,commission_deduct_fees,commission_fee_in_cents,commission_deduct_cost,commission_cost_in_cents ON retail_sales FOR EACH ROW EXECUTE FUNCTION aggenda_billed_commission_event();
