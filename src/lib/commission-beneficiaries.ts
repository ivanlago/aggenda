import { and, eq, gt, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { commissionEntries, commissionRules, organizationMembers, professionals, users } from "@/db/schema";
import { CommissionError, beneficiaryKey, type CommissionBeneficiary, type CommissionBeneficiaryOption } from "./commission-beneficiary";

export async function commissionBeneficiaries(database: typeof db, organizationId: string, includeLinkedMembers = false): Promise<(CommissionBeneficiaryOption & { userId: string | null })[]> {
  const [people, members] = await Promise.all([
    database.select({ id: professionals.id, name: professionals.name, userId: professionals.userId }).from(professionals).where(and(eq(professionals.organizationId, organizationId), eq(professionals.isActive, true))),
    database.select({ id: users.id, name: users.name }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, organizationId)),
  ]);
  return [
    ...people.map(item => ({ value: `professional:${item.id}`, label: `${item.name} · profissional`, userId: item.userId })),
    ...members.filter(item => includeLinkedMembers || !people.some(person => person.userId === item.id)).map(item => ({ value: `user:${item.id}`, label: `${item.name} · equipe`, userId: item.id })),
  ].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function saleCommissionBeneficiaries(database: typeof db, organizationId: string, userId: string) {
  const [people, rules] = await Promise.all([
    commissionBeneficiaries(database, organizationId, true),
    database.select({ professionalId: commissionRules.professionalId, beneficiaryUserId: commissionRules.beneficiaryUserId })
      .from(commissionRules).where(and(eq(commissionRules.organizationId, organizationId), eq(commissionRules.isActive, true), inArray(commissionRules.sourceType, ["product", "service"]), gt(commissionRules.value, 0))),
  ]);
  const eligible = new Set(rules.map(beneficiaryKey));
  const options = people.filter(person => eligible.has(person.value));
  return {
    choices: options.map(({ value, label }) => ({ value, label })),
    defaultBeneficiary: options.find(person => person.userId === userId)?.value ?? "",
  };
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
