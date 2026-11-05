import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FinancialReferenceCatalog } from "@/components/financial-reference-catalog";
import { db } from "@/db";
import { financialAccounts, financialCategories, financialCostCenters } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Cadastros financeiros" };
const tabs = [
  { id: "contas", label: "Contas e caixas" },
  { id: "categorias", label: "Categorias financeiras" },
  { id: "centros-de-custo", label: "Centros de custo" },
] as const;

export default async function FinancialReferencesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.manage")) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão financeira.</p></div>;
  const query = await searchParams;
  const tab = tabs.find(item => item.id === query.aba)?.id ?? "contas";
  const kind = tab === "categorias" ? "financial_category" : tab === "centros-de-custo" ? "cost_center" : "financial_account";
  const records = tab === "categorias"
    ? await db.select({ id: financialCategories.id, name: financialCategories.name, type: financialCategories.type, isActive: financialCategories.isActive }).from(financialCategories).where(eq(financialCategories.organizationId, organization.id)).orderBy(asc(financialCategories.name))
    : tab === "centros-de-custo"
      ? await db.select({ id: financialCostCenters.id, name: financialCostCenters.name, isActive: financialCostCenters.isActive }).from(financialCostCenters).where(eq(financialCostCenters.organizationId, organization.id)).orderBy(asc(financialCostCenters.name))
      : await db.select({ id: financialAccounts.id, name: financialAccounts.name, accountType: financialAccounts.accountType, isActive: financialAccounts.isActive }).from(financialAccounts).where(eq(financialAccounts.organizationId, organization.id)).orderBy(asc(financialAccounts.name));
  return <div className="page-wrap">
    <PageHeader eyebrow="Financeiro" title="Cadastros financeiros" description="Organize suas contas e caixas, categorias financeiras e centros de custo." />
    <nav className="app-tabs" aria-label="Tipos de cadastro financeiro">{tabs.map(item => <Link key={item.id} href={item.id === "contas" ? "/financeiro/cadastros" : `/financeiro/cadastros?aba=${item.id}`} className="app-tab" aria-current={tab === item.id ? "page" : undefined}>{item.label}</Link>)}</nav>
    <div className="app-tab-content"><FinancialReferenceCatalog key={kind} kind={kind} records={records} /></div>
  </div>;
}
