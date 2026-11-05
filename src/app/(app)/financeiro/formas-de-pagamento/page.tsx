import { and, asc, eq } from "drizzle-orm";
import { savePaymentMethod } from "@/actions/payment-methods";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import Link from "next/link";
import { paymentKindLabels, paymentKinds, type PaymentKind } from "@/lib/payment-catalog-policy";
import { financialAccounts, paymentMethods } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

function MethodForm({ method, accounts }: { method?: typeof paymentMethods.$inferSelect; accounts: { id: string; name: string }[] }) {
  return <ActionForm action={savePaymentMethod} successMessage="Forma de pagamento salva." resetOnSuccess={!method} className="grid gap-3">
    {method && <input type="hidden" name="id" value={method.id} />}
    <label className="grid gap-1 text-sm font-bold">Nome
      <input className="field" name="name" required minLength={2} maxLength={80} defaultValue={method?.name} />
    </label>
    <label className="grid gap-1 text-sm font-bold">Tipo<select className="field" name="kind" defaultValue={method?.kind ?? "other"}>{paymentKinds.map(kind => <option key={kind} value={kind}>{paymentKindLabels[kind]}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-bold">Recebimento<select className="field" name="provider" defaultValue={method?.provider ?? "manual"}><option value="manual">Manual / maquininha externa</option><option value="mercado_pago">Mercado Pago</option><option value="asaas">Asaas</option><option value="pagbank">PagBank</option><option value="efi">Efí Bank</option></select></label>
    <label className="grid gap-1 text-sm font-bold">Conta de destino padrão<select className="field" name="defaultAccountId" defaultValue={method?.defaultAccountId ?? ""}><option value="">Definir no recebimento</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={method?.isActive ?? true} /> Disponível para novos pagamentos</label>
    <div><button className="primary-button">{method ? "Salvar alterações" : "Cadastrar forma de pagamento"}</button></div>
  </ActionForm>;
}

export default async function PaymentMethodsPage() {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.manage")) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão financeira.</p></div>;
  const accounts = await db.select({ id: financialAccounts.id, name: financialAccounts.name }).from(financialAccounts).where(and(eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true))).orderBy(asc(financialAccounts.name));
  const methods = await db.select().from(paymentMethods).where(eq(paymentMethods.organizationId, organization.id)).orderBy(asc(paymentMethods.name));
  return <div className="page-wrap grid gap-4">
    <PageHeader eyebrow="Financeiro" title="Formas de pagamento" description="Organize as formas de pagamento e as contas de destino usadas pela empresa." />
    <p className="text-sm text-muted">Cadastre caixas e contas em <Link className="font-bold underline" href="/financeiro?cadastros=contas">Cadastros financeiros</Link>. Pagamentos integrados precisam também de uma conexão ativa em Configurações.</p>
    <section className="panel grid gap-3"><h2 className="font-extrabold">Nova forma de pagamento</h2><MethodForm accounts={accounts} /></section>
    <section className="panel grid gap-3">
      <h2 className="font-extrabold">Formas cadastradas</h2>
      <p className="text-sm text-muted">Este cadastro controla as opções da empresa no PDV, atendimento, financeiro e cobranças. O tipo mantém a classificação dos relatórios; o destino pode ser confirmado ou alterado no pagamento. Desativar preserva o histórico.</p>
      <PaginatedCollection label="Formas cadastradas" className="grid gap-3">
        {methods.map(method => <details className="rounded-xl border p-3" key={method.id}>
          <summary className="cursor-pointer font-bold">{method.name} · {paymentKindLabels[method.kind as PaymentKind]} · {accounts.find(account => account.id === method.defaultAccountId)?.name ?? "Destino no recebimento"} · {method.isActive ? "Ativa" : "Inativa"}</summary>
          <div className="mt-3"><MethodForm method={method} accounts={accounts} /></div>
        </details>)}
      </PaginatedCollection>
      {!methods.length && <p className="text-sm text-muted">Nenhuma forma personalizada cadastrada.</p>}
    </section>
  </div>;
}
