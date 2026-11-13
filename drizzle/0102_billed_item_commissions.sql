CREATE TABLE "collaborator_item_commissions" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"percentage_basis_points" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collaborator_item_commissions_organization_id_user_id_item_type_item_id_pk" PRIMARY KEY("organization_id","user_id","item_type","item_id"),
	CONSTRAINT "collaborator_commission_valid" CHECK ("collaborator_item_commissions"."item_type" in ('product','service','package','kit') and "collaborator_item_commissions"."percentage_basis_points" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "catalog_kits" ADD COLUMN "commission_rate_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "commission_policy_version" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD COLUMN "kit_id" uuid;--> statement-breakpoint
ALTER TABLE "retail_sale_items" ADD COLUMN "commission_rate_basis_points" integer;--> statement-breakpoint
ALTER TABLE "retail_sales" ADD COLUMN "commission_billed_at" timestamp;--> statement-breakpoint
ALTER TABLE "retail_sales" ALTER COLUMN "commission_billed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "service_packages" ADD COLUMN "commission_rate_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "commission_rate_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collaborator_item_commissions" ADD CONSTRAINT "collaborator_item_commissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_item_commissions" ADD CONSTRAINT "collaborator_item_commissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;-- Existing sales have no billed timestamp: preserve their historical ledger.
ALTER TABLE services ADD CONSTRAINT services_commission_range CHECK (commission_rate_basis_points BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE service_packages ADD CONSTRAINT packages_commission_range CHECK (commission_rate_basis_points BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE catalog_kits ADD CONSTRAINT kits_commission_range CHECK (commission_rate_basis_points BETWEEN 0 AND 10000);
--> statement-breakpoint
CREATE FUNCTION aggenda_item_commission_rate(org uuid, beneficiary text, kind text, item uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE rate integer;
BEGIN
  CASE kind
    WHEN 'product' THEN SELECT commission_rate_basis_points INTO rate FROM retail_product_variants WHERE id=item AND organization_id=org;
    WHEN 'service' THEN SELECT commission_rate_basis_points INTO rate FROM services WHERE id=item AND organization_id=org;
    WHEN 'package' THEN SELECT commission_rate_basis_points INTO rate FROM service_packages WHERE id=item AND organization_id=org;
    WHEN 'kit' THEN SELECT commission_rate_basis_points INTO rate FROM catalog_kits WHERE id=item AND organization_id=org;
    ELSE RETURN 0;
  END CASE;
  IF rate IS NULL THEN RAISE EXCEPTION 'Commission item outside organization'; END IF;
  RETURN COALESCE((SELECT percentage_basis_points FROM collaborator_item_commissions WHERE organization_id=org AND user_id=beneficiary AND item_type=kind AND item_id=item),rate);
END $$;
--> statement-breakpoint
CREATE FUNCTION aggenda_snapshot_item_commission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale retail_sales%ROWTYPE; beneficiary text; kind text; item uuid;
BEGIN
  SELECT * INTO sale FROM retail_sales WHERE id=NEW.sale_id AND organization_id=NEW.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale outside organization'; END IF;
  IF sale.commission_billed_at IS NULL THEN RETURN NEW; END IF;
  IF sale.commission_professional_id IS NULL AND sale.commission_user_id IS NULL THEN
    NEW.commission_rate_basis_points:=NULL; NEW.commission_in_cents:=0; RETURN NEW;
  END IF;
  beneficiary:=COALESCE(sale.commission_user_id,(SELECT user_id FROM professionals WHERE id=sale.commission_professional_id AND organization_id=sale.organization_id));
  kind:=CASE WHEN NEW.kit_id IS NOT NULL THEN 'kit' WHEN NEW.package_id IS NOT NULL THEN 'package' WHEN NEW.variant_id IS NOT NULL THEN 'product' ELSE 'service' END;
  item:=COALESCE(NEW.kit_id,NEW.package_id,NEW.variant_id,NEW.service_id);
  NEW.commission_rate_basis_points:=aggenda_item_commission_rate(NEW.organization_id,beneficiary,kind,item);
  NEW.commission_in_cents:=round(NEW.total_in_cents::numeric*NEW.commission_rate_basis_points/10000)::integer;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER billed_commission_snapshot BEFORE INSERT ON retail_sale_items FOR EACH ROW EXECUTE FUNCTION aggenda_snapshot_item_commission();
--> statement-breakpoint
CREATE FUNCTION aggenda_sync_sale_commissions(sale_id_input uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE sale retail_sales%ROWTYPE; line retail_sale_items%ROWTYPE; prior commission_entries%ROWTYPE;
  org_timezone text; beneficiary text; kind text; item uuid; rate integer; target integer; refund_total bigint;
  paid_total bigint; delta integer; adjustment_id uuid; period text;
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
  FOR line IN SELECT * FROM retail_sale_items WHERE sale_id=sale.id AND organization_id=sale.organization_id ORDER BY id LOOP
    kind:=CASE WHEN line.kit_id IS NOT NULL THEN 'kit' WHEN line.package_id IS NOT NULL THEN 'package' WHEN line.variant_id IS NOT NULL THEN 'product' ELSE 'service' END;
    item:=COALESCE(line.kit_id,line.package_id,line.variant_id,line.service_id);
    IF item IS NULL THEN CONTINUE; END IF;
    rate:=COALESCE(line.commission_rate_basis_points,aggenda_item_commission_rate(sale.organization_id,beneficiary,kind,item));
    IF line.commission_rate_basis_points IS NULL THEN
      UPDATE retail_sale_items SET commission_rate_basis_points=rate,commission_in_cents=round(total_in_cents::numeric*rate/10000)::integer WHERE id=line.id;
      line.commission_in_cents:=round(line.total_in_cents::numeric*rate/10000)::integer;
    END IF;
    target:=CASE WHEN sale.status IN ('cancelled','refunded') THEN 0 ELSE round(line.commission_in_cents::numeric*greatest(0,sale.total_in_cents-refund_total)/greatest(1,sale.total_in_cents))::integer END;
    -- A previously commissioned attendance must never earn the same main service twice.
    IF sale.attendance_id IS NOT NULL AND line.variant_name IN ('Serviço realizado','Procedimento realizado') AND EXISTS(SELECT 1 FROM commission_entries WHERE organization_id=sale.organization_id AND appointment_id=sale.attendance_id AND status<>'cancelled') THEN target:=0; END IF;
    SELECT * INTO prior FROM commission_entries WHERE organization_id=sale.organization_id AND source_key='billed:'||line.id::text;
    IF NOT FOUND THEN
      IF target>0 THEN INSERT INTO commission_entries(organization_id,professional_id,beneficiary_user_id,sale_id,sale_item_id,source_key,source_type,description,calculation_type,calculation_value,base_amount_in_cents,amount_in_cents,competence)
        VALUES(sale.organization_id,sale.commission_professional_id,sale.commission_user_id,sale.id,line.id,'billed:'||line.id::text,kind,line.product_name||' · '||line.quantity||' un.','percentage',rate,line.total_in_cents,target,period); END IF;
    ELSIF prior.status<>'paid' THEN
      IF prior.professional_id IS DISTINCT FROM sale.commission_professional_id OR prior.beneficiary_user_id IS DISTINCT FROM sale.commission_user_id THEN RAISE EXCEPTION 'Commission beneficiary is frozen'; END IF;
      UPDATE commission_entries SET amount_in_cents=target,status=CASE WHEN target=0 THEN 'cancelled' ELSE 'pending' END,updated_at=now() WHERE id=prior.id;
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
CREATE FUNCTION aggenda_billed_commission_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='retail_sales' THEN PERFORM aggenda_sync_sale_commissions(NEW.id);
  ELSE PERFORM aggenda_sync_sale_commissions(NEW.sale_id); END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER billed_commission_item AFTER INSERT ON retail_sale_items FOR EACH ROW EXECUTE FUNCTION aggenda_billed_commission_event();
--> statement-breakpoint
CREATE TRIGGER billed_commission_sale AFTER UPDATE OF status,commission_professional_id,commission_user_id ON retail_sales FOR EACH ROW EXECUTE FUNCTION aggenda_billed_commission_event();
--> statement-breakpoint
CREATE TRIGGER billed_commission_refund AFTER INSERT OR UPDATE OF refunded_in_cents ON retail_sale_payments FOR EACH ROW EXECUTE FUNCTION aggenda_billed_commission_event();
