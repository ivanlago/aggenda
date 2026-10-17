import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { appointments, attendancePackageItems, auditLogs, clientPackageBalances, clientPackages, commissionEntries, commissionPaymentItems, commissionPayments, commissionRules, financialAccounts, financialEntries, paymentCharges, packageUsages, retailSaleItems, retailSales, services } from "@/db/schema";
import { organizationDate, zonedDate } from "./organization-time";
import { assertCommissionBeneficiary } from "./commission-beneficiaries";
import { CommissionError, beneficiaryKey, commissionAmount, packageSessionBase, type CommissionBeneficiary } from "./commission-beneficiary";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Entry = typeof commissionEntries.$inferSelect;
type Source = CommissionBeneficiary & { key: string; type: string; description: string; base: number; quantity: number; competence: string; ready: boolean; received: boolean; serviceId?: string; variantId?: string; appointmentId?: string; saleId?: string; saleItemId?: string; fallback?: number };

export class CommissionRepository {
  constructor(private database: typeof db) {}
  private async lock(tx: Transaction, org: string) { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`commission-ledger:${org}`},0))`); }
  async refresh(org: string, timezone: string, actor: string, competence = organizationDate(new Date(),timezone).slice(0,7)) {
    return this.database.transaction(async tx => { await this.lock(tx, org); return this.refreshWith(tx, org, timezone, actor, competence); });
  }
  private async refreshWith(tx: Transaction, org: string, timezone: string, actor: string, competence?: string) {
    const [rules, old, visits, products, sales, finances, charges, uses, extraUses, packages, balances, catalog] = await Promise.all([
      tx.select().from(commissionRules).where(eq(commissionRules.organizationId, org)),
      tx.select().from(commissionEntries).where(eq(commissionEntries.organizationId, org)),
      tx.select({id:appointments.id,professionalId:appointments.professionalId,serviceId:appointments.serviceId,priceInCents:appointments.priceInCents,startsAt:appointments.startsAt,status:appointments.status,metadata:appointments.metadata}).from(appointments).where(eq(appointments.organizationId, org)),
      tx.select().from(retailSaleItems).where(eq(retailSaleItems.organizationId, org)),
      tx.select({id:retailSales.id,attendanceId:retailSales.attendanceId,commissionProfessionalId:retailSales.commissionProfessionalId,commissionUserId:retailSales.commissionUserId,financialEntryId:retailSales.financialEntryId,appointmentFinancialEntryId:retailSales.appointmentFinancialEntryId,soldAt:retailSales.soldAt,status:retailSales.status}).from(retailSales).where(eq(retailSales.organizationId, org)),
      tx.select({id:financialEntries.id,appointmentId:financialEntries.appointmentId,clientPackageId:financialEntries.clientPackageId,type:financialEntries.type,status:financialEntries.status,amountInCents:financialEntries.amountInCents}).from(financialEntries).where(eq(financialEntries.organizationId, org)),
      tx.select({originId:paymentCharges.originId,financialEntryId:paymentCharges.financialEntryId}).from(paymentCharges).where(and(eq(paymentCharges.organizationId, org), eq(paymentCharges.originType, "appointment"))),
      tx.select().from(packageUsages).where(eq(packageUsages.organizationId, org)),
      tx.select().from(attendancePackageItems).where(eq(attendancePackageItems.organizationId, org)),
      tx.select().from(clientPackages).where(eq(clientPackages.organizationId, org)),
      tx.select().from(clientPackageBalances).where(eq(clientPackageBalances.organizationId, org)),
      tx.select({ id: services.id, name: services.name }).from(services).where(eq(services.organizationId, org)),
    ]);
    const existing = new Map(old.filter(item => !item.originalEntryId && item.sourceKey).map(item => [item.sourceKey!, item]));
    const saleMap = new Map(sales.map(item => [item.id, item]));
    const visitMap = new Map(visits.map(item => [item.id, item]));
    const financeMap = new Map(finances.map(item => [item.id, item]));
    const serviceMap = new Map(catalog.map(item => [item.id, item.name]));
    const sources: Source[] = [];
    const packageEvents = [
      ...uses.map(item => ({ ...item, key: `appointment:${item.appointmentId}`, time: item.reservedAt })),
      ...extraUses.map(item => ({ ...item, key: `package-use:${item.id}`, time: item.createdAt })),
    ].filter(item => item.status !== "reversed").sort((a,b) => a.time.getTime() - b.time.getTime() || a.key.localeCompare(b.key));
    const offsets = new Map<string, number>();
    const covered = new Set(uses.filter(item => item.status !== "reversed").map(item => item.appointmentId));
    for (const event of packageEvents) {
      const visit = visitMap.get(event.appointmentId), pack = packages.find(item => item.id === event.clientPackageId), balance = balances.find(item => item.id === event.balanceId);
      const count = balances.filter(item => item.clientPackageId === event.clientPackageId).reduce((sum,item) => sum + item.totalQuantity, 0);
      const offset = offsets.get(event.clientPackageId) || 0; offsets.set(event.clientPackageId, offset + event.quantity);
      if (!visit?.professionalId || !pack || !balance || count === 0) continue;
      const payment = finances.filter(item => item.clientPackageId === pack.id && item.type === "receivable");
      const sale = pack.retailSaleId ? saleMap.get(pack.retailSaleId) : undefined;
      const received = sale ? sale.status === "completed" && financeMap.get(sale.financialEntryId || "")?.status === "received" : payment.length > 0 && payment.every(item => item.status === "received");
      sources.push({ key: event.key, type: "appointment", appointmentId: event.key.startsWith("appointment:") ? visit.id : undefined, professionalId: visit.professionalId, beneficiaryUserId: null, description: `${serviceMap.get(balance.serviceId) || "Procedimento"} · ${event.quantity} sessão(ões) de pacote`, base: packageSessionBase(pack.priceInCents ?? 0, count, offset, event.quantity), quantity: event.quantity, competence: organizationDate(visit.startsAt, timezone).slice(0,7), ready: event.status === "consumed" && visit.status === "completed" && pack.status !== "cancelled" && (!sale || sale.status === "completed"), received, serviceId: balance.serviceId });
    }
    for (const visit of visits) {
      if (!visit.professionalId || covered.has(visit.id) || visit.metadata?.primaryProcedureRemoved === true) continue;
      const depositIds = charges.filter(item => item.originId === visit.id).map(item => item.financialEntryId);
      const bills = finances.filter(item => item.type === "receivable" && (item.appointmentId === visit.id || depositIds.includes(item.id)));
      const liveBills = bills.filter(item => item.status !== "cancelled");
      const primarySales = products.filter(item => item.serviceId === visit.serviceId && item.variantName === "Procedimento realizado" && saleMap.get(item.saleId)?.attendanceId === visit.id);
      const refunded = primarySales.length > 0 && !primarySales.some(item => saleMap.get(item.saleId)?.status === "completed");
      const base = liveBills.length ? liveBills.reduce((sum,item) => sum + item.amountInCents,0) : visit.priceInCents || 0;
      sources.push({ key: `appointment:${visit.id}`, type: "appointment", appointmentId: visit.id, professionalId: visit.professionalId, beneficiaryUserId: null, description: serviceMap.get(visit.serviceId) || "Procedimento", base, quantity: 1, competence: organizationDate(visit.startsAt,timezone).slice(0,7), ready: visit.status === "completed" && !refunded, received: liveBills.length > 0 && liveBills.every(item => item.status === "received"), serviceId: visit.serviceId });
    }
    for (const item of products) {
      const sale = saleMap.get(item.saleId);
      if (!sale || item.packageId || (!sale.commissionProfessionalId && !sale.commissionUserId)) continue;
      if (sale.attendanceId && item.serviceId === visitMap.get(sale.attendanceId)?.serviceId && item.variantName === "Procedimento realizado") continue;
      sources.push({ key: `sale-item:${item.id}`, type: item.variantId ? "product" : "service", saleId: sale.id, saleItemId: item.id, professionalId: sale.commissionProfessionalId, beneficiaryUserId: sale.commissionUserId, description: `${item.productName} · ${item.variantName} · ${item.quantity} un.`, base: item.totalInCents, quantity: item.quantity, competence: organizationDate(sale.soldAt, timezone).slice(0,7), ready: sale.status === "completed", received: financeMap.get(sale.financialEntryId || sale.appointmentFinancialEntryId || "")?.status === "received", serviceId: item.serviceId || undefined, variantId: item.variantId || undefined, fallback: item.variantId ? item.commissionInCents : undefined });
    }
    const desired = new Map<string, { source: Source; amount: number; rule?: typeof commissionRules.$inferSelect; type: string; value: number }>();
    for (const source of sources) {
      let prior = existing.get(source.key);
      if (prior && beneficiaryKey(prior) !== beneficiaryKey(source)) {
        if(prior.status==="paid") throw new CommissionError("O beneficiário de uma origem já quitada mudou. Estorne a quitação anterior antes de mudar o profissional.");
        await tx.update(commissionEntries).set({sourceKey:`superseded:${prior.id}`,appointmentId:null,status:"cancelled",updatedAt:new Date()}).where(eq(commissionEntries.id,prior.id));
        existing.delete(source.key); prior=undefined;
      }
      const rule = (prior?.ruleId ? rules.find(item => item.id === prior.ruleId) : undefined) || rules.filter(item => item.isActive && item.sourceType === source.type && beneficiaryKey(item) === beneficiaryKey(source) && (!item.serviceId || item.serviceId === source.serviceId) && (!item.variantId || item.variantId === source.variantId)).sort((a,b) => Number(Boolean(b.serviceId || b.variantId)) - Number(Boolean(a.serviceId || a.variantId)) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
      if (!rule && source.fallback === undefined && !prior) continue;
      const type = prior?.calculationType || rule?.calculationType || "snapshot";
      const value = prior?.calculationValue ?? rule?.value ?? source.fallback ?? prior?.amountInCents ?? 0;
      const amount = source.ready && (rule?.trigger !== "received" || source.received) && (source.type === "appointment" || source.received) ? commissionAmount(source.base, type, value, source.quantity) : 0;
      desired.set(source.key, { source, amount, rule, type, value });
    }
    let generated = 0;
    for (const [key, item] of desired) {
      const prior = existing.get(key);
      if (prior?.status === "paid") { await this.reconcilePaid(tx, org, timezone, prior, item.amount, old); continue; }
      if (prior && old.some(row => row.originalEntryId === prior.id && row.status === "paid")) throw new CommissionError("Estorne a quitação anterior antes de recalcular esta comissão.");
      if (!prior && (item.amount === 0 || item.source.competence !== competence)) continue;
      const values = { professionalId: item.source.professionalId, beneficiaryUserId: item.source.beneficiaryUserId, baseAmountInCents: item.amount===0&&prior?prior.baseAmountInCents:item.source.base, amountInCents: item.amount===0&&prior?prior.amountInCents:item.amount, description: item.source.description, status: item.amount > 0 ? "pending" : "cancelled", calculationType: item.type, calculationValue: item.value, updatedAt: new Date() };
      if (prior) await tx.update(commissionEntries).set(values).where(eq(commissionEntries.id, prior.id));
      else { await tx.insert(commissionEntries).values({ ...values, organizationId: org, sourceKey: key, sourceType: item.source.type, appointmentId: item.source.appointmentId, saleId: item.source.saleId, saleItemId: item.source.saleItemId, competence: item.source.competence, ruleId: item.rule?.id }); generated++; }
    }
    for (const prior of existing.values()) if (!desired.has(prior.sourceKey!)) {
      if (prior.status === "paid") await this.reconcilePaid(tx,org,timezone,prior,0,old);
      else if (prior.status !== "cancelled") await tx.update(commissionEntries).set({ status: "cancelled", updatedAt: new Date() }).where(eq(commissionEntries.id, prior.id));
    }
    await tx.insert(auditLogs).values({ organizationId: org, userId: actor, action: "reconcile", entityType: "commission_entries", details: { generated } });
    return generated;
  }
  private async reconcilePaid(tx: Transaction, org: string, timezone: string, prior: Entry, target: number, all: Entry[]) {
    const adjustments = all.filter(item => item.originalEntryId === prior.id);
    const paid = adjustments.filter(item => item.status === "paid").reduce((sum,item) => sum + item.amountInCents,0);
    const pending = adjustments.find(item => item.status === "pending");
    const amount = target - prior.amountInCents - paid;
    if (pending) { if (pending.amountInCents !== amount || amount === 0) await tx.update(commissionEntries).set({ amountInCents: amount, status: amount === 0 ? "cancelled" : "pending", updatedAt: new Date() }).where(eq(commissionEntries.id,pending.id)); }
    else if (amount) await tx.insert(commissionEntries).values({ organizationId: org, professionalId: prior.professionalId, beneficiaryUserId: prior.beneficiaryUserId, saleId: prior.saleId, saleItemId: prior.saleItemId, sourceType: "adjustment", sourceKey: `adjustment:${randomUUID()}`, originalEntryId: prior.id, description: `Ajuste · ${prior.description}`, competence: organizationDate(new Date(),timezone).slice(0,7), baseAmountInCents: prior.baseAmountInCents, amountInCents: amount });
  }
  async pay(input: { org: string; timezone: string; actor: string; beneficiary: CommissionBeneficiary; requestKey: string; paidOn: string; accountId: string; method: string; notes: string; expectedAmount: number; entryId?: string }) {
    return this.database.transaction(async tx => {
      await this.lock(tx,input.org);
      const [replay] = await tx.select().from(commissionPayments).where(and(eq(commissionPayments.organizationId,input.org),eq(commissionPayments.requestKey,input.requestKey))).limit(1);
      if (replay) { if (replay.beneficiaryKey !== beneficiaryKey(input.beneficiary)) throw new CommissionError("Esta solicitação já foi usada para outro beneficiário."); return replay.id; }
      const name = await assertCommissionBeneficiary(tx,input.org,input.beneficiary,true);
      const [account] = await tx.select().from(financialAccounts).where(and(eq(financialAccounts.organizationId,input.org),eq(financialAccounts.id,input.accountId),eq(financialAccounts.isActive,true))).limit(1);
      if (!account) throw new CommissionError("Selecione uma conta ativa desta clínica.");
      await this.refreshWith(tx,input.org,input.timezone,input.actor);
      const pending = (await tx.select().from(commissionEntries).where(and(eq(commissionEntries.organizationId,input.org),eq(commissionEntries.status,"pending"))).for("update")).filter(item => beneficiaryKey(item) === beneficiaryKey(input.beneficiary));
      const selected = input.entryId ? pending.filter(item => item.id === input.entryId || item.amountInCents < 0) : pending;
      if (input.entryId && !selected.some(item => item.id === input.entryId)) throw new CommissionError("Esta comissão não está mais pendente. Atualize a página.");
      const total = selected.reduce((sum,item) => sum + item.amountInCents,0);
      if (total !== input.expectedAmount) throw new CommissionError("O saldo mudou. Calcule novamente e confira o valor antes de registrar a quitação.");
      if (!selected.length || total <= 0) throw new CommissionError("Não há saldo positivo para quitar. Ajustes negativos permanecem para compensação.");
      const [financial] = await tx.insert(financialEntries).values({ organizationId: input.org, type: "payable", source: "commission_payment", status: "paid", description: `Comissões · ${name}`, category: "Comissões", amountInCents: total, dueDate: input.paidOn, realizedDate: input.paidOn, accountId: input.accountId, paymentMethod: input.method, notes: input.notes, createdByUserId: input.actor }).returning({ id: financialEntries.id });
      const [payment] = await tx.insert(commissionPayments).values({ organizationId: input.org, beneficiaryKey: beneficiaryKey(input.beneficiary), beneficiaryName: name, requestKey: input.requestKey, amountInCents: total, paidOn: input.paidOn, paidByUserId: input.actor, financialEntryId: financial.id, notes: input.notes }).returning({ id: commissionPayments.id });
      await tx.insert(commissionPaymentItems).values(selected.map(item => ({ paymentId: payment.id, entryId: item.id, amountInCents: item.amountInCents })));
      await tx.update(commissionEntries).set({ status: "paid", paymentId: payment.id, paidAt: zonedDate(input.paidOn,"12:00",input.timezone), updatedAt: new Date() }).where(and(eq(commissionEntries.organizationId,input.org),inArray(commissionEntries.id,selected.map(item=>item.id))));
      await tx.insert(auditLogs).values({ organizationId: input.org, userId: input.actor, action: "pay", entityType: "commission_payment", entityId: payment.id, details: { total, count: selected.length, financialEntryId: financial.id } });
      return payment.id;
    });
  }
  async reverse(org: string, actor: string, paymentId: string, reason: string) {
    await this.database.transaction(async tx => {
      await this.lock(tx,org);
      const [payment] = await tx.select().from(commissionPayments).where(and(eq(commissionPayments.organizationId,org),eq(commissionPayments.id,paymentId))).for("update");
      if (!payment) throw new CommissionError("Quitação não encontrada nesta clínica.");
      if (payment.reversedAt) return;
      const items = await tx.select({ id: commissionEntries.id }).from(commissionEntries).where(and(eq(commissionEntries.organizationId,org),eq(commissionEntries.paymentId,payment.id),eq(commissionEntries.status,"paid")));
      if (!items.length) throw new CommissionError("Não há lançamentos desta quitação para estornar.");
      const adjustments=await tx.select().from(commissionEntries).where(eq(commissionEntries.organizationId,org));
      const affected=new Set(items.map(item=>item.id));
      if (adjustments.some(item=>item.originalEntryId&&affected.has(item.originalEntryId)&&item.status==="paid"&&item.paymentId!==payment.id)) throw new CommissionError("Estorne primeiro a quitação que compensou ajustes deste pagamento.");
      for(const item of adjustments) if(item.originalEntryId&&affected.has(item.originalEntryId)&&item.status==="pending") await tx.update(commissionEntries).set({status:"cancelled",updatedAt:new Date()}).where(eq(commissionEntries.id,item.id));
      await tx.update(financialEntries).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(financialEntries.organizationId,org),eq(financialEntries.id,payment.financialEntryId)));
      await tx.update(commissionEntries).set({ status: "pending", paidAt: null, paymentId: null, updatedAt: new Date() }).where(inArray(commissionEntries.id,items.map(item=>item.id)));
      await tx.update(commissionPayments).set({ reversedAt: new Date(), reversedByUserId: actor, reversalReason: reason }).where(eq(commissionPayments.id,payment.id));
      await tx.insert(auditLogs).values({ organizationId: org, userId: actor, action: "reverse", entityType: "commission_payment", entityId: payment.id, details: { reason } });
    });
  }
}
