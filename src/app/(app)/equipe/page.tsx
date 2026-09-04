import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { organizationMembers, professionalRegistrations, professionalSpecialties, professionals, professions, specialties, users, weeklyAvailability } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

import { TeamCreateForm } from "./team-create-form";
import { TeamMemberCard, type TeamMemberCardData } from "./team-member-card";

export const metadata = { title: "Equipe e acesso" };

export default async function TeamPage() {
  const { session, organization } = await requireOrganization();
  const canRead = hasOrganizationPermission(organization.role, "team.read");
  const canManage = hasOrganizationPermission(organization.role, "team.manage");
  if (!canRead) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão da equipe.</p></div>;

  const [members, professionOptions, specialtyOptions, specialtyRows, registrationRows, availabilityRows] = await Promise.all([
    db.select({ userId: users.id, fullName: users.name, shortName: users.shortName, email: users.email, role: organizationMembers.role, professionalId: professionals.id, professionalName: professionals.name, professionId: professionals.professionId, professionName: professions.name, phone: professionals.phone, bio: professionals.bio })
      .from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId))
      .leftJoin(professionals, and(eq(professionals.organizationId, organization.id), eq(professionals.userId, users.id)))
      .leftJoin(professions, eq(professions.id, professionals.professionId))
      .where(eq(organizationMembers.organizationId, organization.id)).orderBy(users.name),
    db.select({ id: professions.id, name: professions.name }).from(professions).where(eq(professions.isActive, true)).orderBy(professions.sortOrder, professions.name),
    db.select({ id: specialties.id, name: specialties.name, professionId: specialties.professionId }).from(specialties).where(eq(specialties.isActive, true)).orderBy(specialties.sortOrder, specialties.name),
    db.select({ professionalId: professionalSpecialties.professionalId, specialtyId: professionalSpecialties.specialtyId }).from(professionalSpecialties).where(eq(professionalSpecialties.organizationId, organization.id)),
    db.select({ professionalId: professionalRegistrations.professionalId, council: professionalRegistrations.council, registrationNumber: professionalRegistrations.registrationNumber, state: professionalRegistrations.state }).from(professionalRegistrations).where(eq(professionalRegistrations.organizationId, organization.id)),
    db.select({ professionalId: weeklyAvailability.professionalId, dayOfWeek: weeklyAvailability.dayOfWeek, startsAt: weeklyAvailability.startsAt, endsAt: weeklyAvailability.endsAt }).from(weeklyAvailability).where(eq(weeklyAvailability.organizationId, organization.id)),
  ]);

  const memberCards: TeamMemberCardData[] = members.map((member) => {
    const registration = registrationRows.find((row) => row.professionalId === member.professionalId);
    return {
      userId: member.userId, fullName: member.fullName,
      shortName: member.shortName || member.professionalName || member.fullName,
      email: member.email, role: member.role, professionalId: member.professionalId,
      professionId: member.professionId, professionName: member.professionName,
      phone: member.phone, bio: member.bio, council: registration?.council ?? null,
      registrationNumber: registration?.registrationNumber ?? null,
      registrationState: registration?.state ?? null,
      specialtyIds: specialtyRows.filter((row) => row.professionalId === member.professionalId).map((row) => row.specialtyId),
      availability: availabilityRows.filter((row) => row.professionalId === member.professionalId).map((row) => ({ dayOfWeek: row.dayOfWeek, startsAt: row.startsAt, endsAt: row.endsAt })),
    };
  });

  return (
    <div className="page-wrap">
      <PageHeader eyebrow={organization.name} title="Equipe e acesso" description="Cadastre a equipe, defina os acessos e configure quem realiza atendimentos." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1.15fr)]">
        {canManage && <section className="panel xl:sticky xl:top-5"><h2 className="mb-5 text-xl font-extrabold">Cadastrar membro da equipe</h2><TeamCreateForm professions={professionOptions} specialties={specialtyOptions} /></section>}
        <section className="panel">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold">Equipe cadastrada</h2><span className="status-pill">{memberCards.length} {memberCards.length === 1 ? "membro" : "membros"}</span></div>
          <div className="mt-5 grid gap-3">
            {memberCards.map((member) => <TeamMemberCard key={member.userId} member={member} professions={professionOptions} specialties={specialtyOptions} canEdit={canManage} canDelete={canManage && member.role !== "owner" && member.userId !== session.user.id} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
