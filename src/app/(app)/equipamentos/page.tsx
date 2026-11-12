import { PageHeader } from "@/components/page-header";
import { EquipmentSettings } from "@/components/equipment-settings";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Equipamentos" };

export default async function EquipmentPage() {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "organization.settings.manage");
  return <div className="page-wrap"><PageHeader eyebrow="Cadastros" title="Equipamentos" description="Cadastre os equipamentos e vincule os serviços que os utilizam." /><EquipmentSettings organizationId={organization.id} canManage /></div>;
}
