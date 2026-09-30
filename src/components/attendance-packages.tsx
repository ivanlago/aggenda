import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendancePackageItems, packageUsages, servicePackages, clientPackages, clientPackageBalances, services } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { getPosPackageBalances } from "@/lib/pos-package-balances";
import { ActionForm } from "@/components/action-form";
import { selectAttendancePackage } from "@/actions/attendance-pos";
import { addAttendancePackageItem, removeAttendancePackageItem } from "@/actions/attendance-package-items";
import { hasOrganizationPermission } from "@/lib/permissions";

export async function AttendancePackages({ appointmentId }: { appointmentId: string }) {
  const { appointment, organization } = await requireAttendance(appointmentId);
  const [balances, usages, selected] = await Promise.all([
    getPosPackageBalances(organization.id, appointment.clientId),
    db.select({ status: packageUsages.status, name: servicePackages.name }).from(packageUsages).innerJoin(clientPackages, eq(clientPackages.id, packageUsages.clientPackageId)).innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId)).where(and(eq(packageUsages.appointmentId, appointmentId), eq(packageUsages.organizationId, organization.id))),
    db.select({ id: attendancePackageItems.id, balanceId: attendancePackageItems.balanceId, quantity: attendancePackageItems.quantity, status: attendancePackageItems.status, name: services.name, packageName: servicePackages.name }).from(attendancePackageItems).innerJoin(clientPackageBalances, eq(clientPackageBalances.id, attendancePackageItems.balanceId)).innerJoin(services, eq(services.id, clientPackageBalances.serviceId)).innerJoin(clientPackages, eq(clientPackages.id, attendancePackageItems.clientPackageId)).innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId)).where(and(eq(attendancePackageItems.appointmentId, appointmentId), eq(attendancePackageItems.organizationId, organization.id))),
  ]);
  const usage = usages[0];
  const canSelect = ["scheduled", "confirmed"].includes(appointment.status) && hasOrganizationPermission(organization.role, "appointments.manage");
  return <section className="panel mt-5"><h2 className="mb-3 text-lg font-extrabold">Pacotes disponíveis</h2>
    <p className="text-sm text-muted">Selecione individualmente os procedimentos a utilizar. As sessões ficam reservadas e são consumidas ao concluir o atendimento.</p>
    <div className="mt-3 divide-y">
      {balances.map((balance) => {
        const main = balance.serviceId === appointment.serviceId;
        const alreadySelected = selected.some((item) => item.balanceId === balance.id) || (main && Boolean(usage));
        return <div key={balance.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div><p className="font-bold">{balance.serviceName}</p><p className="text-sm text-muted">{balance.packageName} · {balance.remaining} disponíveis{balance.reserved ? ` · ${balance.reserved} reservadas` : ""}</p><p className="text-xs text-muted">{balance.expiresAt ? `${balance.expired ? "Vencido em" : "Válido até"} ${new Date(balance.expiresAt).toLocaleDateString("pt-BR", { timeZone: organization.timezone })}` : "Sem vencimento"}</p></div>
          {canSelect && !alreadySelected && !balance.expired && balance.remaining > 0 && <ActionForm action={main ? selectAttendancePackage : addAttendancePackageItem} successMessage="Procedimento reservado neste atendimento." className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="appointmentId" value={appointmentId} /><input type="hidden" name="clientPackageId" value={balance.clientPackageId} /><input type="hidden" name="balanceId" value={balance.id} />
            {main ? <input type="hidden" name="quantity" value="1" /> : <label className="grid gap-1 text-xs font-bold">Quantidade<input className="field w-24" name="quantity" type="number" min="1" max={balance.remaining} defaultValue="1" required /></label>}
            <button className="secondary-button">Utilizar procedimento</button>
          </ActionForm>}
          {alreadySelected && <span className="text-sm font-bold text-brand">Já vinculado ao atendimento</span>}
        </div>;
      })}
    </div>
    {usage && <p className="mt-3 text-sm font-bold">{usage.name} · Procedimento principal: {usage.status === "consumed" ? "utilizado" : usage.status === "reserved" ? "reservado" : "reserva liberada"}.</p>}
    {selected.map((item) => <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><p className="text-sm"><strong>{item.name} · {item.quantity} sessão(ões)</strong><br />{item.packageName} · {item.status === "consumed" ? "Utilizado" : item.status === "reserved" ? "Reservado" : "Reserva liberada"}</p>{canSelect && item.status === "reserved" && <ActionForm action={removeAttendancePackageItem} successMessage="Procedimento removido e saldo liberado."><input type="hidden" name="appointmentId" value={appointmentId} /><input type="hidden" name="itemId" value={item.id} /><button className="secondary-button">Remover</button></ActionForm>}</div>)}
    {!balances.length && !usage && !selected.length && <p className="mt-3 text-sm text-muted">Nenhum pacote disponível para este cliente.</p>}
  </section>;
}
