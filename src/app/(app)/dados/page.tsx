import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
export default async function DataPage({ searchParams }: { searchParams: Promise<{ pagina?: string; linhas?: string }> }) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage", organization.teamPermissionOverrides);
  const query = await searchParams;
  const params = new URLSearchParams({ aba: "imports" });
  if (query.pagina) params.set("pagina", query.pagina);
  if (query.linhas) params.set("linhas", query.linhas);
  redirect("/configuracoes?" + params.toString());
}
