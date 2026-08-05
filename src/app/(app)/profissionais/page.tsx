import { eq } from "drizzle-orm";
import { CalendarClock, CalendarOff, Trash2 } from "lucide-react";
import Link from "next/link";

import {
  addProfessionalRegistration,
  createProfessional,
  deleteProfessional,
  deleteProfessionalRegistration,
} from "@/actions/app";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import {
  honorifics,
  professionalRegistrations,
  professionals,
  professionalSpecialties,
  professions,
  specialties,
  weeklyAvailability,
} from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Profissionais" };

export default async function ProfessionalsPage() {
  const { organization } = await requireOrganization();
  const [
    professionOptions,
    specialtyOptions,
    honorificOptions,
    items,
    specialtyRows,
    registrationRows,
    availabilityRows,
  ] = await Promise.all([
    db.select().from(professions).where(eq(professions.isActive, true))
      .orderBy(professions.sortOrder, professions.name),
    db.select().from(specialties).where(eq(specialties.isActive, true))
      .orderBy(specialties.sortOrder, specialties.name),
    db.select().from(honorifics).where(eq(honorifics.isActive, true))
      .orderBy(honorifics.sortOrder),
    db
      .select({
        id: professionals.id,
        name: professionals.name,
        title: professionals.title,
        email: professionals.email,
        color: professionals.color,
        customProfession: professionals.customProfession,
        customHonorific: professionals.customHonorific,
        isBookable: professionals.isBookable,
        profession: professions.name,
        honorific: honorifics.label,
      })
      .from(professionals)
      .leftJoin(professions, eq(professions.id, professionals.professionId))
      .leftJoin(honorifics, eq(honorifics.id, professionals.honorificId))
      .where(eq(professionals.organizationId, organization.id))
      .orderBy(professionals.name),
    db
      .select({
        professionalId: professionalSpecialties.professionalId,
        name: specialties.name,
      })
      .from(professionalSpecialties)
      .innerJoin(
        specialties,
        eq(specialties.id, professionalSpecialties.specialtyId)
      )
      .where(eq(professionalSpecialties.organizationId, organization.id)),
    db
      .select()
      .from(professionalRegistrations)
      .where(eq(professionalRegistrations.organizationId, organization.id))
      .orderBy(professionalRegistrations.createdAt),
    db.select({ professionalId: weeklyAvailability.professionalId, dayOfWeek: weeklyAvailability.dayOfWeek, startsAt: weeklyAvailability.startsAt, endsAt: weeklyAvailability.endsAt })
      .from(weeklyAvailability)
      .where(eq(weeklyAvailability.organizationId, organization.id)),
  ]);

  const specialtiesByProfessional = new Map<string, string[]>();
  for (const row of specialtyRows) {
    const current = specialtiesByProfessional.get(row.professionalId) ?? [];
    current.push(row.name);
    specialtiesByProfessional.set(row.professionalId, current);
  }

  const registrationsByProfessional = new Map<string, typeof registrationRows>();
  for (const row of registrationRows) {
    const current = registrationsByProfessional.get(row.professionalId) ?? [];
    current.push(row);
    registrationsByProfessional.set(row.professionalId, current);
  }
  const availabilityByProfessional = new Map<string, typeof availabilityRows>();
  for (const row of availabilityRows) {
    if (!row.professionalId) continue;
    const current = availabilityByProfessional.get(row.professionalId) ?? [];
    current.push(row);
    availabilityByProfessional.set(row.professionalId, current);
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Equipe de atendimento"
        title={organization.professionalLabelPlural}
        description="Cadastre profissões, especialidades, tratamentos e registros sem limitar a composição da equipe."
      />
      <div className="content-grid">
        <form action={createProfessional} className="panel form-stack">
          <h2 className="text-lg font-extrabold">
            Novo {organization.professionalLabel.toLowerCase()}
          </h2>
          <input className="field" name="name" required placeholder="Nome completo" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">
              Forma de tratamento
              <select className="field" name="honorificId" defaultValue="">
                <option value="">Sem tratamento</option>
                {honorificOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Tratamento personalizado
              <input className="field" name="customHonorific" placeholder="Ex.: Me." />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-bold">
            Profissão
            <select className="field" name="professionId" defaultValue="">
              <option value="">Não informada</option>
              {professionOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
              <option value="other">Outra profissão</option>
            </select>
          </label>
          <input
            className="field"
            name="customProfession"
            placeholder="Como exibir a profissão (ex.: Médica)"
          />
          <label className="grid gap-2 text-sm font-bold">
            Especialidades
            <select className="field min-h-32" name="specialtyIds" multiple>
              {professionOptions.map((profession) => {
                const options = specialtyOptions.filter(
                  (item) => item.professionId === profession.id
                );
                return options.length ? (
                  <optgroup key={profession.id} label={profession.name}>
                    {options.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            <span className="text-xs font-normal text-muted">
              Use Ctrl para selecionar mais de uma.
            </span>
          </label>
          <input
            className="field"
            name="title"
            placeholder="Cargo interno ou função, se diferente"
          />
          <textarea
            className="field min-h-20"
            name="bio"
            placeholder="Apresentação breve"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <select className="field" name="council" defaultValue="">
              <option value="">Conselho</option>
              {["CRM", "CRO", "CRP", "COREN", "CREFITO", "OAB", "CREA", "CREF", "OUTRO"].map(
                (item) => <option key={item} value={item}>{item}</option>
              )}
            </select>
            <input className="field" name="registrationNumber" placeholder="Número" />
            <input
              className="field"
              name="registrationState"
              maxLength={2}
              placeholder="UF"
            />
          </div>
          <input className="field" name="email" type="email" placeholder="E-mail" />
          <input className="field" name="phone" type="tel" placeholder="Telefone" />
          <label className="flex items-center gap-3 text-sm font-bold">
            Cor na agenda
            <input name="color" type="color" defaultValue="#18664a" />
          </label>
          <label className="flex items-center gap-3 text-sm font-bold">
            <input name="isBookable" type="checkbox" defaultChecked />
            Pode receber agendamentos
          </label>
          <button className="primary-button">
            Adicionar {organization.professionalLabel.toLowerCase()}
          </button>
        </form>
        <section className="panel">
          <h2 className="text-lg font-extrabold">
            {items.length}{" "}
            {(items.length === 1
              ? organization.professionalLabel
              : organization.professionalLabelPlural
            ).toLowerCase()}
          </h2>
          <div className="mt-5 divide-y">
            {items.map((item) => {
              const itemSpecialties = specialtiesByProfessional.get(item.id) ?? [];
              const itemRegistrations =
                registrationsByProfessional.get(item.id) ?? [];
              const honorific =
                item.customHonorific || item.honorific || "";
              const profession =
                item.customProfession || item.profession || item.title;
              return (
                <div key={item.id} className="flex items-start gap-4 py-4">
                  <span
                    className="mt-2 size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {[honorific, item.name].filter(Boolean).join(" ")}
                    </p>
                    <p className="text-sm text-muted">
                      {[profession, itemSpecialties.join(", ")]
                        .filter(Boolean)
                        .join(" · ") || item.email || organization.professionalLabel}
                    </p>
                    {itemRegistrations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {itemRegistrations.map((registration) => (
                          <div
                            key={registration.id}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"
                          >
                            {[
                              registration.council,
                              registration.registrationNumber,
                              registration.state,
                            ].filter(Boolean).join(" ")}
                            <form action={deleteProfessionalRegistration}>
                              <input
                                type="hidden"
                                name="registrationId"
                                value={registration.id}
                              />
                              <button
                                className="text-red-600"
                                aria-label={`Excluir registro ${registration.council} ${registration.registrationNumber}`}
                              >
                                ×
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    )}
                    {!item.isBookable && (
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                        <CalendarOff className="size-3" /> Não aparece na agenda
                      </span>
                    )}
                    <div className="mt-3 rounded-xl bg-[#f3f5f1] p-3 text-xs">
                      <p className="flex items-center gap-2 font-extrabold text-brand">
                        <CalendarClock className="size-4" /> Disponibilidade
                      </p>
                      <p className="mt-1 text-muted">
                        {(availabilityByProfessional.get(item.id)?.length ?? 0) > 0
                          ? `${availabilityByProfessional.get(item.id)?.length} jornadas semanais configuradas`
                          : "Nenhuma jornada semanal configurada"}
                      </p>
                      <Link className="mt-2 inline-block font-extrabold text-brand underline" href={`/disponibilidade?professionalId=${item.id}`}>
                        Editar dias e horários
                      </Link>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-extrabold text-brand">
                        Adicionar registro profissional
                      </summary>
                      <form
                        action={addProfessionalRegistration}
                        className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_70px_auto]"
                      >
                        <input
                          type="hidden"
                          name="professionalId"
                          value={item.id}
                        />
                        <select className="field py-2" name="council" required>
                          <option value="">Conselho</option>
                          {["CRM", "CRO", "CRP", "COREN", "CREFITO", "OAB", "CREA", "CREF", "OUTRO"].map(
                            (council) => (
                              <option key={council} value={council}>
                                {council}
                              </option>
                            )
                          )}
                        </select>
                        <input
                          className="field py-2"
                          name="registrationNumber"
                          placeholder="Número"
                          required
                        />
                        <input
                          className="field py-2"
                          name="registrationState"
                          maxLength={2}
                          placeholder="UF"
                        />
                        <button className="text-sm font-extrabold text-brand">
                          Adicionar
                        </button>
                      </form>
                    </details>
                  </div>
                  <form action={deleteProfessional}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      className="icon-button"
                      aria-label={`Excluir ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
              );
            })}
            {!items.length && (
              <p className="empty-state">
                Nenhum {organization.professionalLabel.toLowerCase()} cadastrado.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
