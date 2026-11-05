import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { PaymentMethodsCatalog } from "@/components/payment-methods-catalog";
import { db } from "@/db";
import { financialAccounts, paymentMethods } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export default async function PaymentMethodsPage() {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.manage")) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão financeira.</p></div>;
  const [accounts, methods] = await Promise.all([
    db.select({ id: financialAccounts.id, name: financialAccounts.name, isActive: financialAccounts.isActive }).from(financialAccounts).where(eq(financialAccounts.organizationId, organization.id)).orderBy(asc(financialAccounts.name)),
    db.select().from(paymentMethods).where(eq(paymentMethods.organizationId, organization.id)).orderBy(asc(paymentMethods.name)),
  ]);
  return <div className="page-wrap grid gap-5">
    <PageHeader eyebrow="Financeiro" title="Formas de pagamento" description="Cadastre as formas de pagamento e organize suas contas de destino." />
    <PaymentMethodsCatalog methods={methods} accounts={accounts} />
  </div>;
}
