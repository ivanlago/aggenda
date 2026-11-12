import { PageHeader } from "@/components/page-header";
import { RoomSettings } from "@/components/room-settings";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Salas" };

export default async function RoomsPage() {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "organization.settings.manage");
  return <div className="page-wrap"><PageHeader eyebrow="Cadastros" title="Salas" description="Cadastre as salas utilizadas nos atendimentos." /><RoomSettings organizationId={organization.id} canManage /></div>;
}
