CREATE TABLE "honorifics" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professional_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"council" text NOT NULL,
	"registration_number" text NOT NULL,
	"state" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_specialties" (
	"professional_id" uuid NOT NULL,
	"specialty_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "professional_specialties_professional_id_specialty_id_pk" PRIMARY KEY("professional_id","specialty_id")
);
--> statement-breakpoint
CREATE TABLE "professions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialties" (
	"id" text PRIMARY KEY NOT NULL,
	"profession_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "client_label" text DEFAULT 'Cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "client_label_plural" text DEFAULT 'Clientes' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "professional_label" text DEFAULT 'Profissional' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "professional_label_plural" text DEFAULT 'Profissionais' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "service_label" text DEFAULT 'Serviço' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "service_label_plural" text DEFAULT 'Serviços' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "appointment_label" text DEFAULT 'Agendamento' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "appointment_label_plural" text DEFAULT 'Agendamentos' NOT NULL;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "profession_id" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "honorific_id" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "custom_profession" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "custom_honorific" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "is_bookable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "professional_registrations" ADD CONSTRAINT "professional_registrations_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_registrations" ADD CONSTRAINT "professional_registrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_specialty_id_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_profession_id_professions_id_fk" FOREIGN KEY ("profession_id") REFERENCES "public"."professions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professional_registrations_professional_idx" ON "professional_registrations" USING btree ("professional_id");--> statement-breakpoint
CREATE INDEX "professional_registrations_organization_idx" ON "professional_registrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "professional_specialties_organization_idx" ON "professional_specialties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "specialties_profession_idx" ON "specialties" USING btree ("profession_id");--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_profession_id_professions_id_fk" FOREIGN KEY ("profession_id") REFERENCES "public"."professions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_honorific_id_honorifics_id_fk" FOREIGN KEY ("honorific_id") REFERENCES "public"."honorifics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professionals_profession_idx" ON "professionals" USING btree ("profession_id");
--> statement-breakpoint
INSERT INTO "honorifics" ("id", "label", "sort_order") VALUES
	('dr', 'Dr.', 10),
	('dra', 'Dra.', 20),
	('prof', 'Prof.', 30),
	('profa', 'Profa.', 40),
	('sr', 'Sr.', 50),
	('sra', 'Sra.', 60),
	('eng', 'Eng.', 70),
	('arq', 'Arq.', 80),
	('me', 'Me.', 90);
--> statement-breakpoint
INSERT INTO "professions" ("id", "name", "sort_order") VALUES
	('medico', 'Médico', 10),
	('enfermeiro', 'Enfermeiro', 20),
	('tecnico-radiologia', 'Técnico em radiologia', 30),
	('dentista', 'Dentista', 40),
	('psicologo', 'Psicólogo', 50),
	('fisioterapeuta', 'Fisioterapeuta', 60),
	('nutricionista', 'Nutricionista', 70),
	('veterinario', 'Médico-veterinário', 80),
	('terapeuta', 'Terapeuta', 90),
	('advogado', 'Advogado', 100),
	('barbeiro', 'Barbeiro', 110),
	('cabeleireiro', 'Cabeleireiro', 120),
	('esteticista', 'Esteticista', 130),
	('massoterapeuta', 'Massoterapeuta', 140),
	('personal-trainer', 'Personal trainer', 150),
	('consultor', 'Consultor', 160);
--> statement-breakpoint
INSERT INTO "specialties" ("id", "profession_id", "name", "sort_order") VALUES
	('medico-cardiologia', 'medico', 'Cardiologia', 10),
	('medico-clinica-geral', 'medico', 'Clínica médica', 20),
	('medico-dermatologia', 'medico', 'Dermatologia', 30),
	('medico-ginecologia', 'medico', 'Ginecologia e obstetrícia', 40),
	('medico-ortopedia', 'medico', 'Ortopedia e traumatologia', 50),
	('medico-pediatria', 'medico', 'Pediatria', 60),
	('enfermeiro-estomaterapia', 'enfermeiro', 'Estomaterapia', 10),
	('enfermeiro-obstetricia', 'enfermeiro', 'Enfermagem obstétrica', 20),
	('tecnico-radiologia-diagnostico', 'tecnico-radiologia', 'Diagnóstico por imagem', 10),
	('tecnico-radiologia-radioterapia', 'tecnico-radiologia', 'Radioterapia', 20),
	('dentista-clinico-geral', 'dentista', 'Clínica geral', 10),
	('dentista-implantodontia', 'dentista', 'Implantodontia', 20),
	('dentista-ortodontia', 'dentista', 'Ortodontia', 30),
	('dentista-periodontia', 'dentista', 'Periodontia', 40),
	('psicologo-clinica', 'psicologo', 'Psicologia clínica', 10),
	('psicologo-organizacional', 'psicologo', 'Psicologia organizacional', 20),
	('fisioterapeuta-dermatofuncional', 'fisioterapeuta', 'Dermatofuncional', 10),
	('fisioterapeuta-neurofuncional', 'fisioterapeuta', 'Neurofuncional', 20),
	('fisioterapeuta-traumato', 'fisioterapeuta', 'Traumato-ortopédica', 30),
	('nutricionista-clinica', 'nutricionista', 'Nutrição clínica', 10),
	('nutricionista-esportiva', 'nutricionista', 'Nutrição esportiva', 20),
	('veterinario-clinica', 'veterinario', 'Clínica de pequenos animais', 10),
	('veterinario-cirurgia', 'veterinario', 'Cirurgia veterinária', 20),
	('advogado-civil', 'advogado', 'Direito civil', 10),
	('advogado-empresarial', 'advogado', 'Direito empresarial', 20),
	('advogado-familia', 'advogado', 'Direito de família', 30),
	('advogado-previdenciario', 'advogado', 'Direito previdenciário', 40),
	('advogado-trabalhista', 'advogado', 'Direito trabalhista', 50),
	('cabeleireiro-colorista', 'cabeleireiro', 'Colorista', 10),
	('cabeleireiro-corte', 'cabeleireiro', 'Corte', 20),
	('esteticista-corporal', 'esteticista', 'Estética corporal', 10),
	('esteticista-facial', 'esteticista', 'Estética facial', 20),
	('massoterapeuta-desportiva', 'massoterapeuta', 'Massagem desportiva', 10),
	('massoterapeuta-relaxante', 'massoterapeuta', 'Massagem relaxante', 20),
	('personal-trainer-condicionamento', 'personal-trainer', 'Condicionamento físico', 10),
	('personal-trainer-reabilitacao', 'personal-trainer', 'Treinamento para reabilitação', 20);
--> statement-breakpoint
UPDATE "organizations"
SET
	"client_label" = 'Paciente',
	"client_label_plural" = 'Pacientes',
	"service_label" = 'Procedimento',
	"service_label_plural" = 'Procedimentos',
	"appointment_label" = 'Consulta',
	"appointment_label_plural" = 'Consultas'
WHERE "business_type" = 'saude';
--> statement-breakpoint
UPDATE "organizations"
SET
	"professional_label" = 'Advogado',
	"professional_label_plural" = 'Advogados',
	"appointment_label" = 'Reunião',
	"appointment_label_plural" = 'Reuniões'
WHERE "business_type" = 'juridico';
