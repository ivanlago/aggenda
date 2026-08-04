import "dotenv/config";

import { Client } from "pg";

const organizationId = "cb69eb9f-b773-4ce6-9182-4cdb7e96c509";

const professionals = [
  { name: "Dra. Marina Costa", email: "marina@clinicaaura.test", phone: "71990001001", title: "Biomédica Esteta", color: "#7c3aed" },
  { name: "Dra. Beatriz Almeida", email: "beatriz@clinicaaura.test", phone: "71990001002", title: "Dermatologista", color: "#db2777" },
  { name: "Camila Santos", email: "camila@clinicaaura.test", phone: "71990001003", title: "Esteticista", color: "#0891b2" },
  { name: "Juliana Rocha", email: "juliana@clinicaaura.test", phone: "71990001004", title: "Massoterapeuta", color: "#059669" },
];

const services = [
  { name: "Avaliação estética", description: "Avaliação inicial e definição do plano de tratamento.", duration: 30, price: 8000, professionals: [0, 1, 2] },
  { name: "Limpeza de pele profunda", description: "Higienização, extração e hidratação facial.", duration: 60, price: 18000, professionals: [0, 2] },
  { name: "Toxina botulínica", description: "Aplicação estética de toxina botulínica.", duration: 45, price: 95000, professionals: [0, 1] },
  { name: "Preenchimento facial", description: "Harmonização facial com ácido hialurônico.", duration: 60, price: 120000, professionals: [0, 1] },
  { name: "Drenagem linfática", description: "Massagem para estímulo do sistema linfático.", duration: 60, price: 16000, professionals: [2, 3] },
  { name: "Massagem relaxante", description: "Massagem corporal para relaxamento e alívio de tensões.", duration: 60, price: 15000, professionals: [3] },
  { name: "Microagulhamento facial", description: "Tratamento de textura, poros e marcas da pele.", duration: 60, price: 35000, professionals: [0, 2] },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("begin");
    await client.query(
      `update organizations set name = $1, business_type = $2,
       professional_label = $3, professional_label_plural = $4,
       service_label = $5, service_label_plural = $6, updated_at = now()
       where id = $7`,
      ["Clínica Aura Estética", "aesthetic_clinic", "Profissional", "Profissionais", "Procedimento", "Procedimentos", organizationId]
    );

    const professionalIds: string[] = [];
    for (const item of professionals) {
      const result = await client.query<{ id: string }>(
        `insert into professionals (organization_id, name, email, phone, title, custom_profession, color, is_bookable, is_active)
         select $1, $2, $3, $4, $5, $5, $6, true, true
         where not exists (select 1 from professionals where organization_id = $1 and email = $3)
         returning id`,
        [organizationId, item.name, item.email, item.phone, item.title, item.color]
      );
      const existing = result.rows[0] ?? (await client.query<{ id: string }>(
        "select id from professionals where organization_id = $1 and email = $2 limit 1",
        [organizationId, item.email]
      )).rows[0];
      professionalIds.push(existing.id);
    }

    for (const item of services) {
      const result = await client.query<{ id: string }>(
        `insert into services (organization_id, name, description, duration_minutes, price_in_cents, requires_professional, is_active)
         select $1, $2, $3, $4, $5, true, true
         where not exists (select 1 from services where organization_id = $1 and name = $2)
         returning id`,
        [organizationId, item.name, item.description, item.duration, item.price]
      );
      const service = result.rows[0] ?? (await client.query<{ id: string }>(
        "select id from services where organization_id = $1 and name = $2 limit 1",
        [organizationId, item.name]
      )).rows[0];
      for (const index of item.professionals) {
        await client.query(
          `insert into services_to_professionals (service_id, professional_id, organization_id)
           values ($1, $2, $3) on conflict do nothing`,
          [service.id, professionalIds[index], organizationId]
        );
      }
    }

    for (const professionalId of professionalIds) {
      for (const day of [1, 2, 3, 4, 5]) {
        const exists = await client.query(
          `select 1 from weekly_availability
           where organization_id = $1 and professional_id = $2 and day_of_week = $3 limit 1`,
          [organizationId, professionalId, day]
        );
        if (!exists.rowCount) {
          await client.query(
            `insert into weekly_availability (organization_id, professional_id, day_of_week, starts_at, ends_at)
             values ($1, $2, $3, '09:00', '18:00')`,
            [organizationId, professionalId, day]
          );
        }
      }
    }

    await client.query("commit");
    console.log(`Clínica criada com ${professionals.length} profissionais e ${services.length} procedimentos.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
