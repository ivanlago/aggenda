CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"allows_concurrent" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_name_valid" CHECK (length(trim("equipment"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "services_to_equipment" (
	"organization_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	CONSTRAINT "services_to_equipment_service_id_equipment_id_pk" PRIMARY KEY("service_id","equipment_id")
);
--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_to_equipment" ADD CONSTRAINT "services_to_equipment_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_to_equipment" ADD CONSTRAINT "services_to_equipment_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_to_equipment" ADD CONSTRAINT "services_to_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_org_name_unique" ON "equipment" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "service_equipment_org_idx" ON "services_to_equipment" USING btree ("organization_id","equipment_id");
--> statement-breakpoint
CREATE FUNCTION aggenda_equipment_link_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('equipment:' || NEW.organization_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM equipment WHERE id = NEW.equipment_id AND organization_id = NEW.organization_id)
     OR NOT EXISTS (SELECT 1 FROM services WHERE id = NEW.service_id AND organization_id = NEW.organization_id)
  THEN RAISE EXCEPTION 'Equipamento ou serviço de outra empresa.' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER equipment_link_tenant BEFORE INSERT OR UPDATE ON services_to_equipment
FOR EACH ROW EXECUTE FUNCTION aggenda_equipment_link_tenant();
--> statement-breakpoint
CREATE FUNCTION aggenda_reserve_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'confirmed', 'completed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at
      AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
      AND NEW.organization_id = OLD.organization_id
      AND OLD.status IN ('scheduled', 'confirmed', 'completed') THEN RETURN NEW; END IF;
  END IF;
  -- The same lock is held by equipment configuration changes and all booking channels.
  PERFORM pg_advisory_xact_lock(hashtextextended('equipment:' || NEW.organization_id::text, 0));
  IF EXISTS (SELECT 1 FROM services_to_equipment se JOIN equipment e ON e.id = se.equipment_id
    WHERE se.organization_id = NEW.organization_id AND se.service_id = NEW.service_id AND NOT e.is_active)
  THEN RAISE EXCEPTION 'Um equipamento necessário para este serviço está inativo.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM services_to_equipment required JOIN equipment e ON e.id = required.equipment_id
      JOIN services_to_equipment used ON used.equipment_id = e.id AND used.organization_id = NEW.organization_id
      JOIN appointments a ON a.service_id = used.service_id AND a.organization_id = NEW.organization_id
    WHERE required.organization_id = NEW.organization_id AND required.service_id = NEW.service_id
      AND NOT e.allows_concurrent AND e.is_active AND a.id <> NEW.id
      AND a.status IN ('scheduled', 'confirmed', 'completed')
      AND a.starts_at < NEW.ends_at AND a.ends_at > NEW.starts_at
  ) THEN RAISE EXCEPTION 'Um equipamento necessário já está em uso neste horário. Escolha outro horário.' USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER appointments_reserve_equipment BEFORE INSERT OR UPDATE OF starts_at, ends_at, service_id, organization_id, status
ON appointments FOR EACH ROW EXECUTE FUNCTION aggenda_reserve_equipment();
