import { asc, eq } from "drizzle-orm";
import { savePaymentMethod } from "@/actions/payment-methods";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

function MethodForm({ method }: { method?: typeof paymentMethods.$inferSelect }) {
  return <ActionForm action={savePaymentMethod} successMessage="Forma de pagamento salva." resetOnSuccess={!method} className="grid gap-3">
    {method && <input type="hidden" name="id" value={method.id} />}
    <label className="grid gap-1 text-sm font-bold">Nome
      <input className="field" name="name" required minLength={2} maxLength={80} defaultValue={method?.name} />
    </label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={method?.isActive ?? true} /> Disponível no PDV</label>
    <div><button className="primary-button">{method ? "Salvar alterações" : "Cadastrar forma de pagamento"}</button></div>
  </ActionForm>;
}

export default async function PaymentMethodsPage() {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.manage")) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão financeira.</p></div>;
  const methods = await db.select().from(paymentMethods).where(eq(paymentMethods.organizationId, organization.id)).orderBy(asc(paymentMethods.name));
  return <div className="page-wrap grid gap-4">
    <PageHeader eyebrow="Financeiro" title="Formas de pagamento" description="Cadastre opções para registrar recebimentos manuais no PDV e no atendimento." />
    <section className="panel grid gap-3"><h2 className="font-extrabold">Nova forma de pagamento</h2><MethodForm /></section>
    <section className="panel grid gap-3">
      <h2 className="font-extrabold">Formas cadastradas</h2>
      <p className="text-sm text-muted">Dinheiro, cartão, Pix, transferência e boleto já estão disponíveis no PDV. As opções cadastradas aqui aparecem junto delas e ficam na categoria Outros nos relatórios.</p>
      <PaginatedCollection label="Formas cadastradas" className="grid gap-3">
        {methods.map(method => <details className="rounded-xl border p-3" key={method.id}>
          <summary className="cursor-pointer font-bold">{method.name} · {method.isActive ? "Ativa" : "Inativa"}</summary>
          <div className="mt-3"><MethodForm method={method} /></div>
        </details>)}
      </PaginatedCollection>
      {!methods.length && <p className="text-sm text-muted">Nenhuma forma personalizada cadastrada.</p>}
    </section>
  </div>;
}
