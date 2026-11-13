CREATE TABLE "execution_commission_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"client_package_id" uuid,
	"quantity" integer NOT NULL,
	"base_in_cents" integer NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"total_in_cents" integer NOT NULL,
	"executor_id" uuid NOT NULL,
	"assistant_id" uuid,
	"assistant_share_basis_points" integer DEFAULT 0 NOT NULL,
	"session_slots" integer[],
	"allocation_held" boolean DEFAULT true NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collaborator_item_commissions" ALTER COLUMN "percentage_basis_points" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "commission_assistant_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "commission_assistant_share_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "execution_commission_eligible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "collaborator_item_commissions" ADD COLUMN "execution_percentage_basis_points" integer;--> statement-breakpoint
ALTER TABLE "service_packages" ADD COLUMN "execution_commission_rate_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "execution_commission_rate_basis_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_commission_snapshots" ADD CONSTRAINT "execution_commission_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_commission_snapshots" ADD CONSTRAINT "execution_commission_snapshots_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_commission_snapshots" ADD CONSTRAINT "execution_commission_snapshots_client_package_id_client_packages_id_fk" FOREIGN KEY ("client_package_id") REFERENCES "public"."client_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_commission_snapshots" ADD CONSTRAINT "execution_commission_snapshots_executor_id_professionals_id_fk" FOREIGN KEY ("executor_id") REFERENCES "public"."professionals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_commission_snapshots" ADD CONSTRAINT "execution_commission_snapshots_assistant_id_professionals_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."professionals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_snapshot_source_unique" ON "execution_commission_snapshots" USING btree ("organization_id","source_key");--> statement-breakpoint
CREATE INDEX "execution_snapshot_appointment_idx" ON "execution_commission_snapshots" USING btree ("appointment_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_commission_assistant_id_professionals_id_fk" FOREIGN KEY ("commission_assistant_id") REFERENCES "public"."professionals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Do not create execution commissions retroactively for concluded visits.
UPDATE appointments SET execution_commission_eligible=false WHERE status='completed';
--> statement-breakpoint
ALTER TABLE services ADD CONSTRAINT service_execution_rate_check CHECK (execution_commission_rate_basis_points BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE service_packages ADD CONSTRAINT package_execution_rate_check CHECK (execution_commission_rate_basis_points BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE collaborator_item_commissions ADD CONSTRAINT execution_override_check CHECK ((execution_percentage_basis_points IS NULL OR (item_type IN ('service','package') AND execution_percentage_basis_points BETWEEN 0 AND 10000)) AND num_nonnulls(percentage_basis_points,execution_percentage_basis_points)>0);
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT assistant_share_check CHECK (commission_assistant_share_basis_points BETWEEN 0 AND 10000 AND ((commission_assistant_id IS NULL AND commission_assistant_share_basis_points=0) OR (commission_assistant_id IS NOT NULL AND commission_assistant_id IS DISTINCT FROM professional_id)));
--> statement-breakpoint
CREATE FUNCTION aggenda_execution_sources(visit_id uuid) RETURNS TABLE(source_key text,source_type text,source_id uuid,client_package_id uuid,quantity integer,base_in_cents integer,rate_basis_points integer,session_slots integer[],description text,is_consumed boolean) LANGUAGE plpgsql AS $$
DECLARE a appointments%ROWTYPE; e record; frozen execution_commission_snapshots%ROWTYPE; beneficiary text; default_rate integer; pack_price integer; session_count integer; occupied integer[]; claimed jsonb:='{}'; chosen integer[];
BEGIN
 SELECT * INTO a FROM appointments WHERE id=visit_id;
 IF NOT FOUND OR NOT a.execution_commission_eligible OR a.professional_id IS NULL THEN RETURN; END IF;
 SELECT p.user_id INTO beneficiary FROM professionals p WHERE p.id=a.professional_id AND p.organization_id=a.organization_id;
 FOR e IN
  SELECT 'usage:'||u.id::text AS key,'package'::text AS kind,cp.package_id AS item,u.client_package_id AS pack,u.quantity AS qty,b.service_id AS service,u.status='consumed' AS consumed,NULL::integer AS net
   FROM package_usages u JOIN client_packages cp ON cp.id=u.client_package_id AND cp.organization_id=a.organization_id JOIN client_package_balances b ON b.id=u.balance_id AND b.organization_id=a.organization_id
   WHERE u.appointment_id=a.id AND u.organization_id=a.organization_id AND u.status IN ('reserved','consumed')
  UNION ALL
  SELECT 'extra:'||u.id::text,'package',cp.package_id,u.client_package_id,u.quantity,b.service_id,u.status='consumed',NULL::integer
   FROM attendance_package_items u JOIN client_packages cp ON cp.id=u.client_package_id AND cp.organization_id=a.organization_id JOIN client_package_balances b ON b.id=u.balance_id AND b.organization_id=a.organization_id
   WHERE u.appointment_id=a.id AND u.organization_id=a.organization_id AND u.status IN ('reserved','consumed')
  UNION ALL
  SELECT 'primary:'||a.id::text,'service',a.service_id,NULL::uuid,1,a.service_id,true,
   COALESCE((SELECT i.total_in_cents FROM retail_sale_items i JOIN retail_sales s ON s.id=i.sale_id AND s.organization_id=a.organization_id WHERE i.organization_id=a.organization_id AND s.attendance_id=a.id AND i.service_id=a.service_id AND i.variant_name IN ('Serviço realizado','Procedimento realizado') AND s.status NOT IN ('cancelled','refunded') ORDER BY s.created_at DESC,s.id LIMIT 1),a.price_in_cents,(SELECT s.price_in_cents FROM services s WHERE s.id=a.service_id AND s.organization_id=a.organization_id),0)
   WHERE COALESCE(a.metadata->>'primaryProcedureRemoved','false')<>'true' AND NOT EXISTS(SELECT 1 FROM package_usages u WHERE u.appointment_id=a.id AND u.organization_id=a.organization_id AND u.status IN ('reserved','consumed'))
  UNION ALL
  SELECT 'sale-item:'||i.id::text,'service',i.service_id,NULL::uuid,i.quantity,i.service_id,true,i.total_in_cents
   FROM retail_sale_items i JOIN retail_sales s ON s.id=i.sale_id AND s.organization_id=a.organization_id WHERE s.attendance_id=a.id AND i.organization_id=a.organization_id AND i.service_id IS NOT NULL AND i.package_id IS NULL AND i.kit_id IS NULL AND i.variant_name NOT IN ('Serviço realizado','Procedimento realizado') AND s.status NOT IN ('cancelled','refunded')
  ORDER BY key
 LOOP
  -- Existing pre-cutover execution earnings must not be generated a second time.
  IF (e.key LIKE 'primary:%' OR e.key LIKE 'usage:%') AND EXISTS(SELECT 1 FROM commission_entries c WHERE c.organization_id=a.organization_id AND c.appointment_id=a.id AND c.status<>'cancelled') THEN CONTINUE; END IF;
  IF e.key LIKE 'extra:%' AND EXISTS(SELECT 1 FROM commission_entries c WHERE c.organization_id=a.organization_id AND c.source_key='package-use:'||substr(e.key,7) AND c.status<>'cancelled') THEN CONTINUE; END IF;
  SELECT * INTO frozen FROM execution_commission_snapshots x WHERE x.organization_id=a.organization_id AND x.source_key=e.key;
  source_key:=e.key;source_type:=e.kind;source_id:=e.item;client_package_id:=e.pack;quantity:=e.qty;is_consumed:=e.consumed;
  IF FOUND THEN base_in_cents:=frozen.base_in_cents;rate_basis_points:=frozen.rate_basis_points;session_slots:=frozen.session_slots;description:=frozen.description;RETURN NEXT;CONTINUE; END IF;
  IF e.kind='package' THEN
   SELECT p.execution_commission_rate_basis_points,COALESCE(cp.price_in_cents,p.price_in_cents),p.name INTO default_rate,pack_price,description FROM client_packages cp JOIN service_packages p ON p.id=cp.package_id AND p.organization_id=a.organization_id WHERE cp.id=e.pack AND cp.organization_id=a.organization_id;
   SELECT COALESCE(sum(b.total_quantity),0)::integer INTO session_count FROM client_package_balances b WHERE b.client_package_id=e.pack AND b.organization_id=a.organization_id;
   IF session_count<1 THEN CONTINUE; END IF;
   SELECT COALESCE(array_agg(slot),'{}'::integer[]) INTO occupied FROM execution_commission_snapshots x CROSS JOIN LATERAL unnest(x.session_slots) slot WHERE x.organization_id=a.organization_id AND x.client_package_id=e.pack AND x.allocation_held AND x.source_key<>e.key;
   occupied:=occupied||ARRAY(SELECT jsonb_array_elements_text(COALESCE(claimed->e.pack::text,'[]'))::integer);
   SELECT array_agg(slot ORDER BY slot) INTO chosen FROM (SELECT slot FROM generate_series(0,session_count-1) slot WHERE NOT(slot=ANY(occupied)) ORDER BY slot LIMIT e.qty) free;
   IF COALESCE(cardinality(chosen),0)<>e.qty THEN RAISE EXCEPTION 'Não há sessões disponíveis para calcular a comissão deste pacote.'; END IF;
   claimed:=jsonb_set(claimed,ARRAY[e.pack::text],COALESCE(claimed->e.pack::text,'[]')||to_jsonb(chosen));
   SELECT sum(pack_price/session_count+CASE WHEN slot<pack_price%session_count THEN 1 ELSE 0 END)::integer INTO base_in_cents FROM unnest(chosen) slot;
   session_slots:=chosen;description:=description||' · '||e.qty||' sessão(ões)';
  ELSE
   SELECT s.execution_commission_rate_basis_points,s.name INTO default_rate,description FROM services s WHERE s.id=e.item AND s.organization_id=a.organization_id;
   base_in_cents:=e.net;session_slots:=NULL;
  END IF;
  rate_basis_points:=COALESCE((SELECT c.execution_percentage_basis_points FROM collaborator_item_commissions c WHERE c.organization_id=a.organization_id AND c.user_id=beneficiary AND c.item_type=e.kind AND c.item_id=e.item),default_rate,0);
  RETURN NEXT;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION aggenda_execution_ledger(snapshot_id uuid, eligible boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE snap execution_commission_snapshots%ROWTYPE; person uuid; share integer; role_name text; target integer; prior commission_entries%ROWTYPE; adjustment uuid; delta integer; paid bigint; zone text; slot integer;
BEGIN
 SELECT * INTO snap FROM execution_commission_snapshots WHERE id=snapshot_id;
 SELECT timezone INTO zone FROM organizations WHERE id=snap.organization_id;
 FOR slot IN 0..1 LOOP
  person:=CASE WHEN slot=0 THEN snap.executor_id ELSE snap.assistant_id END;
  IF person IS NULL THEN CONTINUE; END IF;
  role_name:=CASE WHEN slot=0 THEN 'executor' ELSE 'assistant' END;
  share:=round(snap.total_in_cents::numeric*snap.assistant_share_basis_points/10000)::integer;
  target:=CASE WHEN NOT eligible THEN 0 WHEN slot=0 THEN snap.total_in_cents-share ELSE share END;
  SELECT * INTO prior FROM commission_entries c WHERE c.organization_id=snap.organization_id AND c.source_key='execution:'||snap.id::text||':'||role_name;
  IF NOT FOUND THEN
   IF target<>0 THEN INSERT INTO commission_entries(organization_id,professional_id,source_key,source_type,description,calculation_type,calculation_value,base_amount_in_cents,amount_in_cents,competence) VALUES(snap.organization_id,person,'execution:'||snap.id::text||':'||role_name,'execution_'||role_name,snap.description||CASE WHEN slot=0 THEN ' · executor' ELSE ' · assistente' END,'snapshot',target,snap.base_in_cents,target,to_char(snap.created_at AT TIME ZONE 'UTC' AT TIME ZONE zone,'YYYY-MM')); END IF;
  ELSIF prior.status<>'paid' THEN UPDATE commission_entries SET amount_in_cents=target,status=CASE WHEN target=0 THEN 'cancelled' ELSE 'pending' END,updated_at=now() WHERE id=prior.id;
  ELSE
   SELECT prior.amount_in_cents+COALESCE(sum(c.amount_in_cents),0) INTO paid FROM commission_entries c WHERE c.original_entry_id=prior.id AND c.status='paid';delta:=target-paid;
   SELECT c.id INTO adjustment FROM commission_entries c WHERE c.original_entry_id=prior.id AND c.status='pending' ORDER BY c.created_at LIMIT 1;
   IF adjustment IS NOT NULL THEN UPDATE commission_entries SET amount_in_cents=delta,status=CASE WHEN delta=0 THEN 'cancelled' ELSE 'pending' END,updated_at=now() WHERE id=adjustment;
   ELSIF delta<>0 THEN INSERT INTO commission_entries(organization_id,professional_id,source_key,source_type,description,calculation_type,calculation_value,original_entry_id,base_amount_in_cents,amount_in_cents,competence) VALUES(snap.organization_id,person,'execution:adjustment:'||gen_random_uuid()::text,'adjustment','Ajuste · '||snap.description,'snapshot',delta,prior.id,snap.base_in_cents,delta,to_char(now() AT TIME ZONE zone,'YYYY-MM')); END IF;
  END IF;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION aggenda_sync_attendance_commissions(visit_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE a appointments%ROWTYPE; snap execution_commission_snapshots%ROWTYPE; src record; held boolean; consumed boolean; new_id uuid;
BEGIN
 SELECT * INTO a FROM appointments WHERE id=visit_id;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commission-ledger:'||a.organization_id::text,0));
 FOR snap IN SELECT * FROM execution_commission_snapshots x WHERE x.appointment_id=a.id AND x.organization_id=a.organization_id LOOP
  held:=true;consumed:=true;
  IF snap.source_key LIKE 'usage:%' THEN SELECT COALESCE(bool_or(u.status IN ('reserved','consumed')),false),COALESCE(bool_or(u.status='consumed'),false) INTO held,consumed FROM package_usages u WHERE u.id=substr(snap.source_key,7)::uuid AND u.organization_id=a.organization_id;
  ELSIF snap.source_key LIKE 'extra:%' THEN SELECT COALESCE(bool_or(u.status IN ('reserved','consumed')),false),COALESCE(bool_or(u.status='consumed'),false) INTO held,consumed FROM attendance_package_items u WHERE u.id=substr(snap.source_key,7)::uuid AND u.organization_id=a.organization_id;
  ELSIF snap.source_key LIKE 'primary:%' THEN consumed:=COALESCE(a.metadata->>'primaryProcedureRemoved','false')<>'true' AND NOT EXISTS(SELECT 1 FROM package_usages u WHERE u.appointment_id=a.id AND u.status IN ('reserved','consumed'));
  END IF;
  IF held AND NOT snap.allocation_held AND EXISTS(SELECT 1 FROM execution_commission_snapshots other WHERE other.organization_id=a.organization_id AND other.client_package_id=snap.client_package_id AND other.id<>snap.id AND other.allocation_held AND other.session_slots && snap.session_slots) THEN RAISE EXCEPTION 'As sessões desta comissão já foram realocadas. Registre um novo atendimento para preservar os valores anteriores.'; END IF;
  UPDATE execution_commission_snapshots SET allocation_held=held WHERE id=snap.id;
  PERFORM aggenda_execution_ledger(snap.id,a.status='completed' AND consumed);
 END LOOP;
 IF a.status<>'completed' OR NOT a.execution_commission_eligible OR a.professional_id IS NULL THEN RETURN; END IF;
 FOR src IN SELECT * FROM aggenda_execution_sources(a.id) LOOP
  IF NOT src.is_consumed OR EXISTS(SELECT 1 FROM execution_commission_snapshots x WHERE x.organization_id=a.organization_id AND x.source_key=src.source_key) THEN CONTINUE; END IF;
  INSERT INTO execution_commission_snapshots(organization_id,appointment_id,source_key,source_type,source_id,client_package_id,quantity,base_in_cents,rate_basis_points,total_in_cents,executor_id,assistant_id,assistant_share_basis_points,session_slots,description)
   VALUES(a.organization_id,a.id,src.source_key,src.source_type,src.source_id,src.client_package_id,src.quantity,src.base_in_cents,src.rate_basis_points,round(src.base_in_cents::numeric*src.rate_basis_points/10000)::integer,a.professional_id,a.commission_assistant_id,a.commission_assistant_share_basis_points,src.session_slots,src.description) RETURNING id INTO new_id;
  PERFORM aggenda_execution_ledger(new_id,true);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION aggenda_execution_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='appointments' THEN PERFORM aggenda_sync_attendance_commissions(NEW.id);
 ELSE PERFORM aggenda_sync_attendance_commissions(CASE WHEN TG_OP='DELETE' THEN OLD.appointment_id ELSE NEW.appointment_id END); END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER execution_visit AFTER UPDATE OF status,metadata ON appointments FOR EACH ROW EXECUTE FUNCTION aggenda_execution_event();
--> statement-breakpoint
CREATE TRIGGER execution_package_usage AFTER INSERT OR UPDATE OR DELETE ON package_usages FOR EACH ROW EXECUTE FUNCTION aggenda_execution_event();
--> statement-breakpoint
CREATE TRIGGER execution_package_extra AFTER INSERT OR UPDATE OR DELETE ON attendance_package_items FOR EACH ROW EXECUTE FUNCTION aggenda_execution_event();
--> statement-breakpoint
CREATE FUNCTION aggenda_execution_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.commission_assistant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM professionals p JOIN organization_members m ON m.organization_id=p.organization_id AND m.user_id=p.user_id WHERE p.id=NEW.commission_assistant_id AND p.organization_id=NEW.organization_id AND p.is_active AND p.is_bookable) THEN RAISE EXCEPTION 'Selecione um assistente ativo da equipe.'; END IF;
 IF TG_OP='UPDATE' AND (NEW.commission_assistant_id IS DISTINCT FROM OLD.commission_assistant_id OR NEW.commission_assistant_share_basis_points<>OLD.commission_assistant_share_basis_points OR NEW.professional_id IS DISTINCT FROM OLD.professional_id) AND EXISTS(SELECT 1 FROM execution_commission_snapshots x WHERE x.appointment_id=NEW.id) THEN RAISE EXCEPTION 'A divisão de comissão deste atendimento já foi registrada e não pode ser alterada.'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER execution_config_guard BEFORE INSERT OR UPDATE OF commission_assistant_id,commission_assistant_share_basis_points,professional_id ON appointments FOR EACH ROW EXECUTE FUNCTION aggenda_execution_config_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION aggenda_billed_commission_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale_key uuid; visit_key uuid;
BEGIN
 IF TG_TABLE_NAME='retail_sales' THEN sale_key:=NEW.id; ELSE sale_key:=NEW.sale_id; END IF;
 PERFORM aggenda_sync_sale_commissions(sale_key);
 SELECT attendance_id INTO visit_key FROM retail_sales WHERE id=sale_key;
 IF visit_key IS NOT NULL THEN PERFORM aggenda_sync_attendance_commissions(visit_key); END IF;
 RETURN NEW;
END $$;
