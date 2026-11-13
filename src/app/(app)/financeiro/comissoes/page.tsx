import { CommissionAssessmentForm } from "@/components/commission-assessment-form";
import { PaginatedCollection } from "@/components/paginated-collection";
import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { assignSaleCommissionBeneficiary, calculateCommissions, reverseCommissionPayment } from "@/actions/commissions";
import { ActionForm } from "@/components/action-form";
import { CommissionBeneficiarySelect, CommissionPaymentForm, commissionMoney as money } from "@/components/commission-forms";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { commissionEntries, commissionPayments, financialAccounts, professionals, retailSales, retailSaleItems, retailSalePayments, users } from "@/db/schema";
import { commissionBeneficiaries } from "@/lib/commission-beneficiaries";
import { beneficiaryKey } from "@/lib/commission-beneficiary";
import { commissionAssessment } from "@/lib/commission-assessment";
import { commissionListFilters, type CommissionListQuery } from "@/lib/commission-list";
import { organizationDate, zonedDate } from "@/lib/organization-time";
import { assertOrganizationPermission, hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Comissões" };
const sources:Record<string,string>={execution_executor:"Execução — executor",execution_assistant:"Execução — assistente",appointment:"Atendimento",product:"Produto",service:"Serviço no PDV",package:"Pacote",kit:"Kit",adjustment:"Ajuste"};
const statuses:Record<string,string>={pending:"A pagar",paid:"Paga",cancelled:"Cancelada"};
const dateLabel=(date:string)=>date.split("-").reverse().join("/");
export default async function CommissionsPage({searchParams}:{searchParams:Promise<CommissionListQuery>}) {
  const {organization}=await requireOrganization();
  assertOrganizationPermission(organization.role,"finance.read");
  const canManage=hasOrganizationPermission(organization.role,"finance.manage");
  const today=organizationDate(new Date(),organization.timezone);
  const filters=commissionListFilters(await searchParams,today);
  const rangeStart=zonedDate(filters.error?today:filters.start,"00:00",organization.timezone).toISOString();
  const nextDate=new Date(Date.parse(filters.error?today:filters.end)+86400000).toISOString().slice(0,10);
  const rangeEnd=zonedDate(nextDate,"00:00",organization.timezone).toISOString();
  const [choices,entries,payments,accounts,people,members,unassigned,assessmentItems,assessmentPayments]=await Promise.all([
    commissionBeneficiaries(db,organization.id),
    db.select().from(commissionEntries).where(eq(commissionEntries.organizationId,organization.id)).orderBy(desc(commissionEntries.createdAt)),
    db.select({payment:commissionPayments,operator:users.name}).from(commissionPayments).leftJoin(users,eq(users.id,commissionPayments.paidByUserId)).where(eq(commissionPayments.organizationId,organization.id)).orderBy(desc(commissionPayments.createdAt)),
    db.select({id:financialAccounts.id,name:financialAccounts.name}).from(financialAccounts).where(and(eq(financialAccounts.organizationId,organization.id),eq(financialAccounts.isActive,true))),
    db.select({id:professionals.id,name:professionals.name,userId:professionals.userId}).from(professionals).where(eq(professionals.organizationId,organization.id)),
    db.select({id:users.id,name:users.name}).from(users).innerJoin(commissionEntries,eq(users.id,commissionEntries.beneficiaryUserId)).where(eq(commissionEntries.organizationId,organization.id)),
    db.select({id:retailSales.id,soldAt:retailSales.soldAt,total:retailSales.totalInCents}).from(retailSales).where(and(eq(retailSales.organizationId,organization.id),isNotNull(retailSales.commissionBilledAt),isNull(retailSales.commissionProfessionalId),isNull(retailSales.commissionUserId))).orderBy(desc(retailSales.soldAt)).limit(50),
    db.select({sale:retailSales,line:retailSaleItems}).from(retailSales).innerJoin(retailSaleItems,and(eq(retailSaleItems.saleId,retailSales.id),eq(retailSaleItems.organizationId,organization.id))).where(and(eq(retailSales.organizationId,organization.id),isNotNull(retailSales.commissionBilledAt),sql`exists (select 1 from commission_entries c where c.organization_id=${organization.id} and c.sale_id=${retailSales.id} and c.created_at>=${rangeStart}::timestamp and c.created_at<${rangeEnd}::timestamp)`)),
    db.select({saleId:retailSalePayments.saleId,refunded:retailSalePayments.refundedInCents}).from(retailSalePayments).where(eq(retailSalePayments.organizationId,organization.id)),
  ]);
  const names=new Map([...choices.map(item=>[item.value,item.label] as const),...people.map(item=>[`professional:${item.id}`,item.name] as const),...members.map(item=>[`user:${item.id}`,item.name] as const)]);
  const name=(key:string)=>names.get(key)||"Beneficiário anterior";
  const linkedUsers=new Map(people.filter(person=>person.userId).map(person=>[`professional:${person.id}`,`user:${person.userId}`]));
  const collaborator=(key:string)=>linkedUsers.get(key)??key;
  const filterNames=new Map([...names].map(([key,label])=>[collaborator(key),label]));
  const selectedCollaborator=collaborator(filters.beneficiary);
  const saleMap=new Map(assessmentItems.map(({sale})=>[sale.id,sale]));
  const lineMap=new Map<string,typeof assessmentItems>();
  for(const row of assessmentItems) lineMap.set(row.sale.id,[...(lineMap.get(row.sale.id)??[]),row]);
  const previews=new Map<string,ReturnType<typeof commissionAssessment>>();
  for(const [id,sale] of saleMap) {
    const lines=lineMap.get(id)??[];
    previews.set(id,commissionAssessment(lines.map(({line})=>({id:line.id,name:line.productName,net:line.totalInCents,discount:line.discountInCents,rate:line.commissionRateBasisPoints??0})),filters.deductDiscount,filters.deductFees?(sale.commissionFeeInCents??0):0,assessmentPayments.filter(item=>item.saleId===id).reduce((sum,item)=>sum+item.refunded,0)));
  }
  const pendingCredits=new Map<string,number>();
  for(const entry of entries) if(entry.status==="pending"&&entry.amountInCents<0) {const key=beneficiaryKey(entry);pendingCredits.set(key,(pendingCredits.get(key)??0)+entry.amountInCents);}
  const paidSaleIds=new Set(entries.filter(entry=>entry.status==="paid"&&entry.saleId).map(entry=>entry.saleId));
  const visible=entries.filter(entry=>{
    const date=organizationDate(entry.createdAt,organization.timezone);
    return !filters.error&&date>=filters.start&&date<=filters.end&&(!filters.beneficiary||collaborator(beneficiaryKey(entry))===selectedCollaborator)&&(!filters.status||entry.status===filters.status);
  }).map(entry=>{
    const sale=entry.saleId?saleMap.get(entry.saleId):undefined;
    const assessed=entry.status==="pending"&&entry.sourceKey===`billed:${entry.saleItemId}`&&sale&&!paidSaleIds.has(sale.id)&&!["cancelled","refunded"].includes(sale.status);
    const preview=assessed&&sale?previews.get(sale.id)?.find(row=>row.id===entry.saleItemId):undefined;
    const feePending=Boolean(assessed&&sale&&filters.deductFees&&sale.commissionFeeInCents===null);
    const changed=Boolean(assessed&&sale&&(filters.deductDiscount!==sale.commissionDeductDiscount||filters.deductFees!==sale.commissionDeductFees));
    return {entry,sale,preview,feePending,changed,amount:preview&&!feePending?preview.commission:entry.amountInCents};
  });
  const hasPreview=visible.some(row=>row.changed||row.feePending);
  return <div className="page-wrap">
    <PageHeader eyebrow="Financeiro" title="Comissões" description="Lançamentos, apuração e quitações." actions={canManage&&<ActionForm action={calculateCommissions} successMessage="Comissões atualizadas."><input type="hidden" name="competence" value={today.slice(0,7)}/><button className="primary-button">Atualizar saldos</button></ActionForm>}/>
    <form method="get" className="panel mb-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <input type="hidden" name="consulta" value="1"/>
      <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><legend className="mb-2 text-sm font-bold" title="Data de geração da comissão">Período</legend><input className="field min-w-0" name="inicio" type="date" required defaultValue={filters.start} aria-label="Data inicial do período"/><span className="text-xs text-muted">a</span><input className="field min-w-0" name="fim" type="date" required defaultValue={filters.end} aria-label="Data final do período"/></fieldset>
      <label className="grid gap-2 text-sm font-bold">Colaborador<select className="field" name="beneficiario" defaultValue={selectedCollaborator}><option value="">Todos os colaboradores</option>{[...filterNames].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold">Situação<select className="field" name="status" defaultValue={filters.status}><option value="">Todas</option><option value="pending">A pagar</option><option value="paid">Pagas</option><option value="cancelled">Canceladas</option></select></label>
      <button className="primary-button self-end">Filtrar</button>
      <fieldset className="col-span-full flex flex-wrap items-center gap-x-5 gap-y-2"><legend className="sr-only">Abatimentos na base das comissões de venda pendentes</legend>{[["taxa","Considerar taxa do cartão",filters.deductFees],["desconto","Considerar desconto da venda",filters.deductDiscount]].map(([key,label,checked])=><label className="flex items-center gap-2 text-sm" key={String(key)}><input type="checkbox" name={String(key)} value="1" defaultChecked={Boolean(checked)}/>{label}</label>)}</fieldset>
    </form>
    {filters.error&&<p role="alert" className="mb-3 text-sm text-red-700">{filters.error}</p>}
    <section className="panel mb-3" aria-label="Lista de comissões">
      <dl className="grid gap-x-5 gap-y-2 border-b pb-3 sm:grid-cols-3">{[["A pagar no período",visible.filter(row=>row.entry.status==="pending").reduce((sum,row)=>sum+row.amount,0)],["Pagas no período",visible.filter(row=>row.entry.status==="paid").reduce((sum,row)=>sum+row.amount,0)],["Canceladas no período",visible.filter(row=>row.entry.status==="cancelled").reduce((sum,row)=>sum+row.amount,0)]].map(([label,value])=><div key={String(label)} className="flex flex-wrap items-baseline justify-between gap-x-2"><dt className="text-xs text-muted">{label}</dt><dd className="text-lg font-extrabold">{money(Number(value))}</dd></div>)}</dl>
      <p className="my-2 text-xs text-muted">{visible.length} lançamento(s) · período de geração{hasPreview?" · Prévia dos abatimentos: aplique a apuração antes de quitar. Valores pagos e cancelados preservados.":""}</p>
      <div className="overflow-x-auto"><table className="app-list-table w-full text-left text-sm"><caption className="sr-only">Comissões filtradas por período, colaborador e situação</caption><thead><tr className="border-b text-xs text-muted"><th className="py-2">Data</th><th>Colaborador / origem</th><th>Situação</th><th className="text-right">Base</th><th className="text-right">Comissão</th><th className="text-right">Ações</th></tr></thead><PaginatedCollection as="tbody" label="Registros" pageSize={20}>{visible.map(({entry,sale,preview,changed,feePending,amount})=>{
        const key=beneficiaryKey(entry),credit=pendingCredits.get(key)??0;
        const locked=Boolean(sale&&paidSaleIds.has(sale.id));
        const lines=sale?lineMap.get(sale.id)??[]:[];
        return <tr className="border-b" key={entry.id}><td className="py-3 align-top whitespace-nowrap">{dateLabel(organizationDate(entry.createdAt,organization.timezone))}</td><td className="py-3"><p className="font-bold">{name(key)}</p><p>{entry.description}</p><p className="text-xs text-muted">{sources[entry.sourceType]}{entry.paidAt?` · Quitada em ${dateLabel(organizationDate(entry.paidAt,organization.timezone))}`:""}</p></td><td><span className="status-pill">{statuses[entry.status]??entry.status}</span>{feePending?<p className="text-xs text-amber-800">Taxa pendente</p>:changed?<p className="text-xs text-amber-800">Prévia</p>:null}</td><td className="text-right whitespace-nowrap">{money(preview&&!feePending?preview.base:entry.baseAmountInCents)}</td><td className="text-right font-bold whitespace-nowrap">{money(amount)}</td><td><div className="flex flex-wrap justify-end gap-2">
          {canManage&&sale&&entry.saleItemId&&<CommissionAssessmentForm key={JSON.stringify([sale.id,filters,locked,sale.commissionFeeInCents,sale.commissionDeductDiscount,sale.commissionDeductFees])} saleId={sale.id} lines={lines.map(({line})=>({id:line.id,name:line.productName,net:line.totalInCents,discount:line.discountInCents,rate:line.commissionRateBasisPoints??0}))} deductDiscount={locked?sale.commissionDeductDiscount:filters.deductDiscount} deductFees={locked?sale.commissionDeductFees:filters.deductFees} fee={sale.commissionFeeInCents} refund={assessmentPayments.filter(row=>row.saleId===sale.id).reduce((sum,row)=>sum+row.refunded,0)} locked={locked||["cancelled","refunded"].includes(sale.status)}/>}
          {canManage&&entry.status==="pending"&&!changed&&!feePending&&entry.amountInCents>0&&entry.amountInCents+credit>0&&<CommissionPaymentForm beneficiary={key} label={name(key)} entryId={entry.id} amount={entry.amountInCents+credit} accounts={accounts} today={today}/>}
        </div></td></tr>;
      })}</PaginatedCollection></table></div>
      {!visible.length&&<p className="empty-state">Nenhuma comissão para os filtros selecionados.</p>}
    </section>
    <details className="panel mb-3"><summary className="cursor-pointer text-sm font-bold text-brand">Como as comissões são calculadas</summary><p className="mt-3 text-sm text-muted">O período considera a data de geração. Abatimentos alteram apenas a prévia das comissões de venda a pagar; confirme em Apurar comissão. A taxa total informada é rateada entre os itens pelo valor após descontos. Os percentuais de comissão definidos pela clínica já devem considerar seus custos. Na ausência de taxa registrada, informe o valor real, inclusive zero. Comissões de execução e valores pagos/cancelados mantêm os registros originais. Ajustes negativos pendentes do colaborador, inclusive de outros períodos, são compensados ao quitar.</p></details>
    <details className="panel mb-3"><summary className="cursor-pointer text-lg font-extrabold">Histórico de quitações</summary><p className="mt-3 text-sm text-muted">Estornar o registro cancela a saída financeira e reabre o saldo; não transfere dinheiro.</p><PaginatedCollection label="Registros" className="mt-3 divide-y">{payments.filter(({payment})=>!filters.error&&payment.paidOn>=filters.start&&payment.paidOn<=filters.end&&(!filters.beneficiary||collaborator(payment.beneficiaryKey)===selectedCollaborator)).map(({payment,operator})=><article className="grid gap-3 py-3" key={payment.id}><div className="flex flex-wrap justify-between gap-2"><strong>{payment.beneficiaryName} · {money(payment.amountInCents)}</strong><span className="status-pill">{payment.reversedAt?"Estornada":"Quitada"}</span></div><p className="text-sm text-muted">{dateLabel(payment.paidOn)} · registrado por {operator||"Usuário anterior"}{payment.notes?` · ${payment.notes}`:""}</p>{payment.reversedAt?<p className="text-sm text-amber-800">Motivo: {payment.reversalReason}</p>:canManage&&<ActionForm action={reverseCommissionPayment} successMessage="Quitação estornada e saldo reaberto." className="flex flex-wrap gap-3"><input type="hidden" name="id" value={payment.id}/><input className="field flex-1" name="reason" required minLength={5} maxLength={2000} aria-label="Motivo do estorno" placeholder="Motivo obrigatório do estorno"/><button className="secondary-button">Estornar registro</button></ActionForm>}</article>)}</PaginatedCollection></details>
    {canManage&&<details className="panel mb-3"><summary className="cursor-pointer text-lg font-extrabold">Vendas sem colaborador definido</summary><p className="mt-3 text-sm text-muted">Até 50 vendas recentes. O operador não é presumido como beneficiário.</p><PaginatedCollection label="Registros" className="mt-3 divide-y">{unassigned.map(item=><ActionForm key={item.id} action={assignSaleCommissionBeneficiary} successMessage="Beneficiário definido e comissões atualizadas." className="grid gap-3 py-3 sm:grid-cols-[1fr_1fr_auto]"><input type="hidden" name="saleId" value={item.id}/><p className="text-sm">Venda #{item.id.slice(0,8)} · {dateLabel(organizationDate(item.soldAt,organization.timezone))} · {money(item.total)}</p><CommissionBeneficiarySelect choices={choices}/><button className="secondary-button">Vincular</button></ActionForm>)}</PaginatedCollection></details>}
  </div>;
}
