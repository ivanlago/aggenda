import { and, desc, eq, isNull } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { removeAttendancePrimaryProcedure } from "@/actions/attendance-primary-procedure";
import { removeAttendancePackageItem } from "@/actions/attendance-package-items";
import { db } from "@/db";
import { appointmentInventoryConsumptions, attendancePackageItems, clientPackageBalances, clientPackages, inventoryProducts, packageUsages, retailSaleItems, retailSales, servicePackages, services } from "@/db/schema";
import { AttendanceItemPicker } from "@/components/attendance-item-picker";
import { getPosOfferings, getPosProducts } from "@/lib/pos-catalog";
import { getPosPackageBalances } from "@/lib/pos-package-balances";
import { attendancePendingItems } from "@/lib/attendance-pending-items";
import { addAttendanceItem, removeAttendancePendingItem } from "@/actions/attendance-items";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireAttendance } from "@/lib/attendance";

export async function AttendanceItems({ appointmentId }: { appointmentId: string }) {
  const { appointment, organization } = await requireAttendance(appointmentId);
  const [primary, packages, purchases, consumptions] = await Promise.all([
    db.select({ name: services.name, packageName: servicePackages.name, packageStatus: packageUsages.status }).from(services)
      .leftJoin(packageUsages, and(eq(packageUsages.appointmentId, appointmentId), eq(packageUsages.organizationId, organization.id)))
      .leftJoin(clientPackages, eq(clientPackages.id, packageUsages.clientPackageId)).leftJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
      .where(and(eq(services.id, appointment.serviceId), eq(services.organizationId, organization.id))),
    db.select({ id: attendancePackageItems.id, balanceId: attendancePackageItems.balanceId, quantity: attendancePackageItems.quantity, status: attendancePackageItems.status, name: services.name, packageName: servicePackages.name }).from(attendancePackageItems)
      .innerJoin(clientPackageBalances, eq(clientPackageBalances.id, attendancePackageItems.balanceId)).innerJoin(services, eq(services.id, clientPackageBalances.serviceId))
      .innerJoin(clientPackages, eq(clientPackages.id, attendancePackageItems.clientPackageId)).innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
      .where(and(eq(attendancePackageItems.appointmentId, appointmentId), eq(attendancePackageItems.organizationId, organization.id))),
    db.select({ id: retailSaleItems.id, name: retailSaleItems.productName, variant: retailSaleItems.variantName, quantity: retailSaleItems.quantity, serviceId: retailSaleItems.serviceId, packageId: retailSaleItems.packageId, status: retailSales.status }).from(retailSaleItems)
      .innerJoin(retailSales, eq(retailSales.id, retailSaleItems.saleId))
      .where(and(eq(retailSales.attendanceId, appointmentId), eq(retailSales.organizationId, organization.id), eq(retailSaleItems.organizationId, organization.id))).orderBy(desc(retailSales.soldAt)),
    db.select({ id: inventoryProducts.id, name: inventoryProducts.name, unit: inventoryProducts.unit, quantity: appointmentInventoryConsumptions.quantityMillis }).from(appointmentInventoryConsumptions)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, appointmentInventoryConsumptions.productId))
      .where(and(eq(appointmentInventoryConsumptions.appointmentId, appointmentId), eq(appointmentInventoryConsumptions.organizationId, organization.id), isNull(appointmentInventoryConsumptions.reversedAt))),
  ]);
  const main = primary[0];
  const packageStatus = (status: string) => status === "consumed" ? "Utilizado" : status === "reserved" ? "Reservado" : "Reserva liberada";
  const pending = attendancePendingItems(appointment.metadata);
  const rows = [
    ...pending.map((item) => ({ id: item.id, name: item.label, quantity: String(item.quantity), origin: "À venda", status: "Pendente de cobrança" })),
    ...(main && appointment.metadata?.primaryProcedureRemoved !== true ? [{ id: "primary", name: main.name, quantity: "1", origin: main.packageName ? `Pacote: ${main.packageName}` : "Procedimento principal", status: main.packageStatus ? packageStatus(main.packageStatus) : appointment.status === "completed" ? "Realizado" : ["cancelled", "no_show"].includes(appointment.status) ? "Não realizado" : "Previsto neste atendimento" }] : []),
    ...packages.map((item) => ({ id: item.id, name: item.name, quantity: String(item.quantity), origin: `Pacote: ${item.packageName}`, status: packageStatus(item.status) })),
    ...purchases.filter((item) => !(item.serviceId === appointment.serviceId && item.variant === "Procedimento realizado")).map((item) => ({ id: item.id, name: item.name + (item.variant && !item.serviceId && !item.packageId ? ` · ${item.variant}` : ""), quantity: String(item.quantity), origin: item.serviceId ? "Procedimento adquirido no atendimento" : item.packageId ? "Pacote adquirido no atendimento" : "Produto adquirido no atendimento", status: item.status === "completed" ? "Compra registrada" : "Venda cancelada / estornada" })),
    ...consumptions.map((item) => ({ id: `stock-${item.id}`, name: item.name, quantity: `${(item.quantity / 1000).toLocaleString("pt-BR")} ${item.unit === "unit" ? "un." : item.unit}`, origin: "Consumo de estoque", status: "Utilizado" })),
  ];
  const canUsePackages = hasOrganizationPermission(organization.role, "appointments.manage");
  const canSell = organization.role === "professional" || hasOrganizationPermission(organization.role, "finance.manage") || hasOrganizationPermission(organization.role, "sales.sell") || hasOrganizationPermission(organization.role, "inventory.manage");
  const [balances, offerings, products] = await Promise.all([getPosPackageBalances(organization.id, appointment.clientId), canSell ? getPosOfferings(organization.id) : [], canSell ? getPosProducts(organization.id) : []]);
  const options = [
    ...balances.filter((item) => canUsePackages && !item.expired && item.remaining > 0 && !packages.some((selected) => selected.balanceId === item.id) && !(item.serviceId === appointment.serviceId && main?.packageStatus)).map((item) => ({ id: item.id, label: item.serviceName + " · " + item.packageName + " · " + item.remaining + " disponíveis", source: "package" as const, available: item.remaining })),
    ...[...offerings.filter((item) => item.kind === "service" && !item.unavailableReason && (appointment.metadata?.primaryProcedureRemoved === true || item.id !== "service:" + appointment.serviceId)), ...products].filter((item) => item.stock > 0).map((item) => ({ id: item.id, label: item.label, source: "sale" as const, available: item.stock })),
  ];
  return <section className="mt-4" id="itens-atendimento">
    <h3 className="font-extrabold">Procedimentos/produtos</h3>
    <p className="mt-1 text-sm text-muted">Adicione os itens durante o atendimento. Os itens à venda devem ser pagos antes de finalizar; os itens de pacote utilizam o saldo disponível.</p>
    <div className="mt-3 divide-y">{rows.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold">{item.name}</p><p className="text-sm text-muted">{item.origin} · Quantidade: {item.quantity}</p></div><div className="flex items-center gap-2"><span className="status-pill">{item.status}</span>{((canSell && pending.some((candidate) => candidate.id === item.id)) || (canUsePackages && (item.id === "primary" || packages.some((candidate) => candidate.id === item.id)))) && <ActionForm action={pending.some((candidate) => candidate.id === item.id) ? removeAttendancePendingItem : item.id === "primary" ? removeAttendancePrimaryProcedure : removeAttendancePackageItem} successMessage="Item removido do atendimento."><input type="hidden" name="appointmentId" value={appointmentId} /><input type="hidden" name="itemId" value={item.id} /><button className="rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label={`Remover ${item.name}`} title={`Remover ${item.name}`}><Trash2 className="size-4" /></button></ActionForm>}</div></article>)}</div>
    {(canUsePackages || canSell) && <AttendanceItemPicker appointmentId={appointmentId} options={options} action={addAttendanceItem} />}
  </section>;
}
