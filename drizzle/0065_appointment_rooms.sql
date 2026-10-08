CREATE TABLE "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rooms_name_not_empty" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE INDEX "rooms_organization_idx" ON "rooms" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_organization_name_idx" ON "rooms" ("organization_id", "name");
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "room_id" uuid REFERENCES "rooms"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "appointments_room_start_idx" ON "appointments" ("room_id", "starts_at");
--> statement-breakpoint
-- Every booking channel uses this rule, including legacy integrations.
CREATE FUNCTION aggenda_reserve_appointment_room() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rooms WHERE id = NEW.room_id AND organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'Sala inválida para esta clínica.' USING ERRCODE = '23514'; END IF;

  IF NEW.status NOT IN ('scheduled', 'confirmed', 'completed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.starts_at = OLD.starts_at AND NEW.ends_at = OLD.ends_at
      AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
      AND OLD.status IN ('scheduled', 'confirmed', 'completed') THEN RETURN NEW; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('rooms:' || NEW.organization_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM rooms WHERE organization_id = NEW.organization_id) THEN RETURN NEW; END IF;
  IF NEW.ends_at <= NEW.starts_at THEN RAISE EXCEPTION 'Período do agendamento inválido.' USING ERRCODE = '23514'; END IF;

  IF NEW.room_id IS NULL THEN
    SELECT r.id INTO NEW.room_id FROM rooms r
    WHERE r.organization_id = NEW.organization_id AND r.is_active
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.organization_id = NEW.organization_id
        AND a.room_id = r.id AND a.id <> NEW.id AND a.status IN ('scheduled', 'confirmed', 'completed')
        AND a.starts_at < NEW.ends_at AND a.ends_at > NEW.starts_at)
    ORDER BY r.name, r.id LIMIT 1;
    IF NEW.room_id IS NULL THEN
      RAISE EXCEPTION 'Nenhuma sala disponível neste horário. Escolha outro horário.' USING ERRCODE = '23P01';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM rooms WHERE id = NEW.room_id AND organization_id = NEW.organization_id AND is_active) THEN
      RAISE EXCEPTION 'A sala selecionada está inativa.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM appointments a WHERE a.organization_id = NEW.organization_id
      AND a.room_id = NEW.room_id AND a.id <> NEW.id AND a.status IN ('scheduled', 'confirmed', 'completed')
      AND a.starts_at < NEW.ends_at AND a.ends_at > NEW.starts_at) THEN
      RAISE EXCEPTION 'A sala selecionada já está reservada neste horário.' USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER appointments_reserve_room BEFORE INSERT OR UPDATE OF starts_at, ends_at, room_id, status
ON appointments FOR EACH ROW EXECUTE FUNCTION aggenda_reserve_appointment_room();
