import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import {
  honorifics,
  professionalRegistrations,
  professionals,
  professionalSpecialties,
  professions,
  specialties,
} from "@/db/schema";
import { requireN8nOrganization } from "@/lib/n8n-api";

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;

  const [items, specialtyRows, registrationRows] = await Promise.all([
    db
      .select({
        id: professionals.id,
        name: professionals.name,
        title: professionals.title,
        email: professionals.email,
        phone: professionals.phone,
        isBookable: professionals.isBookable,
        profession: professions.name,
        customProfession: professionals.customProfession,
        honorific: honorifics.label,
        customHonorific: professionals.customHonorific,
      })
      .from(professionals)
      .leftJoin(professions, eq(professions.id, professionals.professionId))
      .leftJoin(honorifics, eq(honorifics.id, professionals.honorificId))
      .where(
        and(
          eq(professionals.organizationId, auth.organization.id),
          eq(professionals.isActive, true)
        )
      )
      .orderBy(professionals.name),
    db
      .select({
        professionalId: professionalSpecialties.professionalId,
        id: specialties.id,
        name: specialties.name,
      })
      .from(professionalSpecialties)
      .innerJoin(
        specialties,
        eq(specialties.id, professionalSpecialties.specialtyId)
      )
      .where(eq(professionalSpecialties.organizationId, auth.organization.id)),
    db
      .select({
        professionalId: professionalRegistrations.professionalId,
        council: professionalRegistrations.council,
        number: professionalRegistrations.registrationNumber,
        state: professionalRegistrations.state,
      })
      .from(professionalRegistrations)
      .where(eq(professionalRegistrations.organizationId, auth.organization.id)),
  ]);
  const specialtyMap = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of specialtyRows) {
    const current = specialtyMap.get(row.professionalId) ?? [];
    current.push({ id: row.id, name: row.name });
    specialtyMap.set(row.professionalId, current);
  }
  const registrationMap = new Map<
    string,
    Array<{ council: string; number: string; state: string | null }>
  >();
  for (const row of registrationRows) {
    const current = registrationMap.get(row.professionalId) ?? [];
    current.push({
      council: row.council,
      number: row.number,
      state: row.state,
    });
    registrationMap.set(row.professionalId, current);
  }

  return NextResponse.json({
    professionals: items.map((item) => {
      const treatment = item.customHonorific || item.honorific || null;
      return {
        ...item,
        treatment,
        displayName: [treatment, item.name].filter(Boolean).join(" "),
        profession: item.customProfession || item.profession || null,
        specialties: specialtyMap.get(item.id) ?? [],
        registrations: registrationMap.get(item.id) ?? [],
      };
    }),
  });
}
