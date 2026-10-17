import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { commissionEntries, organizationMembers, professionals, users } from "@/db/schema";
import { CommissionError, beneficiaryKey, type CommissionBeneficiary, type CommissionBeneficiaryOption } from "./commission-beneficiary";

export async function commissionBeneficiaries(database: typeof db, organizationId: string): Promise<CommissionBeneficiaryOption[]> {
  const [people, members] = await Promise.all([
    database.select({ id: professionals.id, name: professionals.name, userId: professionals.userId }).from(professionals).where(and(eq(professionals.organizationId, organizationId), eq(professionals.isActive, true))),
    database.select({ id: users.id, name: users.name }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, organizationId)),
  ]);
  return [...people.map(item => ({ value: `professional:${item.id}`, label: `${item.name} · profissional` })), ...members.filter(item => !people.some(person => person.userId === item.id)).map(item => ({ value: `user:${item.id}`, label: `${item.name} · equipe` }))].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
export async function assertCommissionBeneficiary(database: Pick<typeof db, "select">, org: string, value: CommissionBeneficiary, allowFormer = false) {
  const rows = value.professionalId
    ? await database.select({ name: professionals.name }).from(professionals).where(and(eq(professionals.id, value.professionalId), eq(professionals.organizationId, org), allowFormer ? undefined : eq(professionals.isActive, true))).limit(1)
    : await database.select({ name: users.name }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(and(eq(organizationMembers.organizationId, org), eq(organizationMembers.userId, value.beneficiaryUserId || ""))).limit(1);
  if (!rows.length && allowFormer && value.beneficiaryUserId) {
    const [former]=await database.select({name:users.name}).from(commissionEntries).innerJoin(users,eq(users.id,commissionEntries.beneficiaryUserId)).where(and(eq(commissionEntries.organizationId,org),eq(commissionEntries.beneficiaryUserId,value.beneficiaryUserId))).limit(1);
    if(former) return former.name;
  }
  if (!rows.length || !beneficiaryKey(value)) throw new CommissionError("Beneficiário não encontrado nesta clínica.");
  return rows[0].name;
}
