import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { packageUsages, servicePackages, clientPackages } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { getPosPackageBalances } from "@/lib/pos-package-balances";
import { PosPackageNotice } from "@/components/pos-package-notice";
import { ActionForm } from "@/components/action-form";
import { selectAttendancePackage } from "@/actions/attendance-pos";
import { hasOrganizationPermission } from "@/lib/permissions";

export async function AttendancePackages({ appointmentId }: { appointmentId: string }) {
  const { appointment, organization } = await requireAttendance(appointmentId);
  const [balances, usages] = await Promise.all([
    getPosPackageBalances(organization.id, appointment.clientId),
    db.select({ status: packageUsages.status, name: servicePackages.name }).from(packageUsages).innerJoin(clientPackages, eq(clientPackages.id, packageUsages.clientPackageId)).innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId)).where(and(eq(packageUsages.appointmentId, appointmentId), eq(packageUsages.organizationId, organization.id))),
  ]);
  const usage = usages[0];
  const eligible = balances.filter((balance) => balance.serviceId === appointment.serviceId && !balance.expired && balance.remaining > 0);
  if (!balances.length && !usage) return null;
  return <section className="panel mt-5"><h2 className="mb-3 text-lg font-extrabold">Procedimento por pacote</h2>
    <PosPackageNotice balances={balances} timezone={organization.timezone} />
    {usage && <p className="mt-3 text-sm font-bold">{usage.name} · {usage.status === "consumed" ? "Sessão utilizada neste atendimento." : usage.status === "reserved" ? "Sessão reservada. O saldo será abatido ao concluir o atendimento." : "Reserva liberada."}</p>}
    {!usage && eligible.length > 0 && ["scheduled", "confirmed"].includes(appointment.status) && hasOrganizationPermission(organization.role, "appointments.manage") && <ActionForm action={selectAttendancePackage} successMessage="Pacote vinculado. A sessão será consumida ao concluir o atendimento." className="mt-3 flex flex-wrap gap-3"><input type="hidden" name="appointmentId" value={appointmentId} /><select name="clientPackageId" className="field max-w-sm" aria-label="Pacote para este procedimento" required defaultValue=""><option value="" disabled>Selecione o pacote</option>{eligible.map((balance) => <option key={balance.id} value={balance.clientPackageId}>{balance.packageName} · {balance.remaining} disponíveis</option>)}</select><button className="secondary-button">Utilizar pacote neste atendimento</button></ActionForm>}
  </section>;
}
