import { MemberCommissionEditor } from "@/components/member-commission-editor";
import { MemberPartnershipForm } from "@/components/member-partnership-form";
import { MemberVisualSignature, MemberProfessionalSignature } from "@/components/member-signature-panels";
import { commissionCatalog } from "@/lib/commission-catalog";
import { ActionForm } from "@/components/action-form";
import { updateTeamProfilePermissions } from "@/actions/team";

import { ModalShell } from "@/components/modal-shell";
import { PaginatedCollection } from "@/components/paginated-collection";
import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { collaboratorItemCommissions, professionalFiscalPartnerships, professionalSigningIdentities, organizationMembers, professionalGoogleCalendarAccounts, professionalRegistrations, professionalSpecialties, professionals, professions, specialties, users, weeklyAvailability } from "@/db/schema";
import { configurableTeamPermissions, hasOrganizationPermission, teamRoles, teamRoleLabels, type OrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

import { TeamCreateForm } from "./team-create-form";
import { TeamMemberCard, type TeamMemberCardData } from "./team-member-card";

export const metadata = { title: "Equipe e acesso" };

export default async function TeamPage() {
  const { session, organization } = await requireOrganization();
  const canRead = hasOrganizationPermission(organization.role, "team.read");
  const canManage = hasOrganizationPermission(organization.role, "team.manage");
  const canFinance=hasOrganizationPermission(organization.role,"finance.manage",organization.teamPermissionOverrides);
  const [ownMember]=await db.select({image:organizationMembers.signatureImage}).from(organizationMembers).where(and(eq(organizationMembers.organizationId,organization.id),eq(organizationMembers.userId,session.user.id)));
  const [catalog,overrides,partners,ownSignatures]=await Promise.all([commissionCatalog(db,organization.id),db.select().from(collaboratorItemCommissions).where(and(eq(collaboratorItemCommissions.organizationId,organization.id),canFinance?undefined:eq(collaboratorItemCommissions.userId,session.user.id))),canFinance?db.select().from(professionalFiscalPartnerships).where(eq(professionalFiscalPartnerships.organizationId,organization.id)):Promise.resolve([]),db.select({id:professionals.id,image:professionals.signatureImage,active:professionals.isActive,identity:professionalSigningIdentities.professionalId}).from(professionals).leftJoin(professionalSigningIdentities,and(eq(professionalSigningIdentities.professionalId,professionals.id),eq(professionalSigningIdentities.organizationId,organization.id))).where(and(eq(professionals.organizationId,organization.id),eq(professionals.userId,session.user.id)))]);

  const [members, professionOptions, specialtyOptions, specialtyRows, registrationRows, availabilityRows, googleAccounts] = await Promise.all([
    db.select({ userId: users.id, fullName: users.name, shortName: users.shortName, email: users.email, lastSignedInAt: users.lastSignedInAt, role: organizationMembers.role, receivesAppointments: professionals.isBookable, professionalActive: professionals.isActive, professionalId: professionals.id, professionalName: professionals.name, agendaOrder: professionals.agendaOrder, professionId: professionals.professionId, professionName: professions.name, phone: professionals.phone, bio: professionals.bio, imageUrl: professionals.imageUrl })
      .from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId))
      .leftJoin(professionals, and(eq(professionals.organizationId, organization.id), eq(professionals.userId, users.id)))
      .leftJoin(professions, eq(professions.id, professionals.professionId))
      .where(and(eq(organizationMembers.organizationId, organization.id),canRead?undefined:eq(users.id,session.user.id))).orderBy(users.name),
    db.select({ id: professions.id, name: professions.name }).from(professions).where(eq(professions.isActive, true)).orderBy(professions.sortOrder, professions.name),
    db.select({ id: specialties.id, name: specialties.name, professionId: specialties.professionId }).from(specialties).where(eq(specialties.isActive, true)).orderBy(specialties.sortOrder, specialties.name),
    db.select({ professionalId: professionalSpecialties.professionalId, specialtyId: professionalSpecialties.specialtyId }).from(professionalSpecialties).where(eq(professionalSpecialties.organizationId, organization.id)),
    db.select({ professionalId: professionalRegistrations.professionalId, council: professionalRegistrations.council, registrationNumber: professionalRegistrations.registrationNumber, state: professionalRegistrations.state }).from(professionalRegistrations).where(eq(professionalRegistrations.organizationId, organization.id)),
    db.select({ professionalId: weeklyAvailability.professionalId, dayOfWeek: weeklyAvailability.dayOfWeek, startsAt: weeklyAvailability.startsAt, endsAt: weeklyAvailability.endsAt }).from(weeklyAvailability).where(eq(weeklyAvailability.organizationId, organization.id)),
    db.select({ professionalId: professionalGoogleCalendarAccounts.professionalId, googleEmail: professionalGoogleCalendarAccounts.googleEmail }).from(professionalGoogleCalendarAccounts).where(eq(professionalGoogleCalendarAccounts.organizationId, organization.id)),
  ]);

  const memberCards: TeamMemberCardData[] = members.map((member) => {
    const registration = registrationRows.find((row) => row.professionalId === member.professionalId);
    return {
      userId: member.userId, fullName: member.fullName,
      shortName: member.shortName || member.professionalName || member.fullName,
      receivesAppointments: Boolean(member.receivesAppointments&&member.professionalActive), email: member.email, role: member.role, professionalId: member.professionalId, agendaOrder: member.agendaOrder,
      lastSignedIn: member.lastSignedInAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: organization.timezone }).format(member.lastSignedInAt) : null,
      professionId: member.professionId, professionName: member.professionName,
      phone: member.phone, bio: member.bio, council: registration?.council ?? null,
      registrationNumber: registration?.registrationNumber ?? null,
      registrationState: registration?.state ?? null,
      imageUrl: member.imageUrl,
      googleCalendarEmail: googleAccounts.find(account => account.professionalId === member.professionalId)?.googleEmail ?? null,
      specialtyIds: specialtyRows.filter((row) => row.professionalId === member.professionalId).map((row) => row.specialtyId),
      availability: availabilityRows.filter((row) => row.professionalId === member.professionalId).map((row) => ({ dayOfWeek: row.dayOfWeek, startsAt: row.startsAt, endsAt: row.endsAt })),
    };
  });

  return (
    <div className="page-wrap">
      <PageHeader eyebrow={organization.name} title="Equipe e acesso" description="Cadastre a equipe, defina os acessos e configure quem realiza atendimentos." />
      <div className="grid items-start gap-5">

        {organization.role === "owner" && <details className="panel">
          <summary className="cursor-pointer font-extrabold">Configurar perfis de acesso</summary>
          <ActionForm action={updateTeamProfilePermissions} successMessage="Perfis atualizados." className="mt-4 grid gap-4">
            <p className="text-xs text-slate-500 leading-5">As permissões operacionais valem para todos os membros com o perfil selecionado. O acesso do titular é preservado.</p>
            <div className="grid gap-4 md:grid-cols-3">
              {teamRoles.map((role) => <fieldset key={role} className="grid gap-2 rounded-xl border p-3">
                <legend className="font-bold">{teamRoleLabels[role]}</legend>
                {Object.entries(configurableTeamPermissions).map(([permission, label]) => <label key={permission} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={role} value={permission} defaultChecked={hasOrganizationPermission(role, permission as OrganizationPermission, organization.teamPermissionOverrides)} />
                  {label}
                </label>)}
              </fieldset>)}
            </div>
            <div><button className="primary-button">Salvar perfis</button></div>
          </ActionForm>
        </details>}

        {canManage && <div><ModalShell title="Novo membro da equipe" variant="new" wide closeOnSuccess><TeamCreateForm professions={professionOptions} specialties={specialtyOptions} /></ModalShell></div>}
        <section className="panel">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold">Equipe cadastrada</h2><span className="status-pill">{memberCards.length} {memberCards.length === 1 ? "membro" : "membros"}</span></div>
          <PaginatedCollection label="Registros" className="mt-5 grid gap-3">
            {memberCards.map((member) => <TeamMemberCard key={member.userId} member={member} professions={professionOptions} specialties={specialtyOptions} own={member.userId===session.user.id} commissionPanel={<div className="grid gap-5">{canFinance||member.userId===session.user.id?<MemberCommissionEditor userId={member.userId} canManage={canFinance} items={catalog.map(item=>({...item,executionIndividual:overrides.find(row=>row.userId===member.userId&&row.itemType===item.type&&row.itemId===item.id)?.executionPercentageBasisPoints??null,individual:overrides.find(row=>row.userId===member.userId&&row.itemType===item.type&&row.itemId===item.id)?.percentageBasisPoints??null}))}/>:<p className="text-xs text-slate-500 leading-5">Acesso restrito à gestão financeira.</p>}</div>} partnershipPanel={canFinance ? member.professionalId ? <MemberPartnershipForm professionalId={member.professionalId} partner={partners.find(row=>row.professionalId===member.professionalId)}/> : <p className="text-xs text-slate-500 leading-5">Salve o cadastro com “Recebe agendamento” habilitado para configurar a parceria do profissional.</p> : <p className="text-xs text-slate-500 leading-5">Acesso restrito à gestão financeira.</p>} visualPanel={<MemberVisualSignature own={member.userId===session.user.id} image={member.userId===session.user.id?(ownMember?.image??ownSignatures.find(row=>row.id===member.professionalId)?.image??null):null}/>} signaturePanel={<MemberProfessionalSignature own={member.userId===session.user.id} enabled={Boolean(ownSignatures.find(row=>row.id===member.professionalId)?.active)&&hasOrganizationPermission(organization.role,"documents.sign",organization.teamPermissionOverrides)} configured={Boolean(ownSignatures.find(row=>row.id===member.professionalId)?.identity)}/>} canEdit={canManage} canDelete={canManage && member.role !== "owner" && member.userId !== session.user.id} />)}
          </PaginatedCollection>
        </section>
      </div>
    </div>
  );
}
