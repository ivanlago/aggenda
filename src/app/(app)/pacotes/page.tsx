import { and, eq } from "drizzle-orm";
import { PackageCheck, Power, PowerOff } from "lucide-react";

import {
  assignPackageToClient,
  createServicePackage,
  toggleServicePackage,
} from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import {
  clientPackageBalances,
  clientPackages,
  clients,
  servicePackageItems,
  servicePackages,
  services,
} from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";

export const metadata = { title: "Pacotes" };

const money = (value: number) =>
  (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function PackagesPage() {
  const { organization } = await requireOrganization();
  const canManageTemplates = hasOrganizationPermission(organization.role, "services.manage");
  const canAssignPackages = hasOrganizationPermission(organization.role, "clients.manage");
  const [serviceRows, clientRows, templates, templateItems, assigned, balances] =
    await Promise.all([
      db.select().from(services).where(and(
        eq(services.organizationId, organization.id), eq(services.isActive, true)
      )).orderBy(services.name),
      db.select({ id: clients.id, name: clients.name }).from(clients)
        .where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
      db.select().from(servicePackages)
        .where(eq(servicePackages.organizationId, organization.id))
        .orderBy(servicePackages.name),
      db.select({
        packageId: servicePackageItems.packageId,
        serviceName: services.name,
        quantity: servicePackageItems.quantity,
      }).from(servicePackageItems)
        .innerJoin(services, eq(services.id, servicePackageItems.serviceId))
        .where(eq(servicePackageItems.organizationId, organization.id)),
      db.select({
        id: clientPackages.id,
        client: clients.name,
        packageName: servicePackages.name,
        priceInCents: clientPackages.priceInCents,
        status: clientPackages.status,
        purchasedAt: clientPackages.purchasedAt,
        expiresAt: clientPackages.expiresAt,
      }).from(clientPackages)
        .innerJoin(clients, eq(clients.id, clientPackages.clientId))
        .innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
        .where(eq(clientPackages.organizationId, organization.id))
        .orderBy(clientPackages.purchasedAt),
      db.select({
        clientPackageId: clientPackageBalances.clientPackageId,
        serviceName: services.name,
        total: clientPackageBalances.totalQuantity,
        used: clientPackageBalances.usedQuantity,
      }).from(clientPackageBalances)
        .innerJoin(services, eq(services.id, clientPackageBalances.serviceId))
        .where(eq(clientPackageBalances.organizationId, organization.id)),
    ]);

  const itemsByTemplate = new Map<string, typeof templateItems>();
  for (const item of templateItems) {
    const list = itemsByTemplate.get(item.packageId) ?? [];
    list.push(item);
    itemsByTemplate.set(item.packageId, list);
  }
  const balancesByPurchase = new Map<string, typeof balances>();
  for (const balance of balances) {
    const list = balancesByPurchase.get(balance.clientPackageId) ?? [];
    list.push(balance);
    balancesByPurchase.set(balance.clientPackageId, list);
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Catálogo e saldo"
        title="Pacotes"
        description="Monte combinações de serviços, vincule ao cliente e acompanhe as sessões disponíveis."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        {canManageTemplates && <ActionForm action={createServicePackage} successMessage="Pacote criado com sucesso." className="panel form-stack">
          <h2 className="text-lg font-extrabold">Novo pacote</h2>
          <input className="field" name="name" required placeholder="Ex.: Pacote 10 massagens" />
          <textarea className="field min-h-20" name="description" placeholder="Descrição ou condições da promoção" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="field" name="price" inputMode="decimal" required placeholder="Preço do pacote (ex.: 900,00)" />
            <input className="field" name="validityDays" type="number" min="1" placeholder="Validade em dias (opcional)" />
          </div>
          <div className="rounded-2xl border p-4">
            <p className="text-sm font-extrabold">Serviços e quantidades</p>
            <div className="mt-3 grid gap-3">
              {serviceRows.map((service) => (
                <label key={service.id} className="grid grid-cols-[1fr_90px] items-center gap-3 text-sm font-bold">
                  <span>{service.name}</span>
                  <input className="field py-2" name={`quantity:${service.id}`} type="number" min="0" defaultValue="0" aria-label={`Quantidade de ${service.name}`} />
                </label>
              ))}
              {!serviceRows.length && <p className="text-sm text-muted">Cadastre serviços antes de montar um pacote.</p>}
            </div>
          </div>
          <button className="primary-button" disabled={!serviceRows.length}>Criar pacote</button>
        </ActionForm>}

        {canAssignPackages && <ActionForm action={assignPackageToClient} successMessage="Pacote vinculado ao cliente com sucesso." className="panel form-stack">
          <h2 className="text-lg font-extrabold">Vender ou vincular pacote</h2>
          <select className="field" name="clientId" required defaultValue="">
            <option value="" disabled>Selecione o {organization.clientLabel.toLowerCase()}</option>
            {clientRows.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          <select className="field" name="packageId" required defaultValue="">
            <option value="" disabled>Selecione o pacote</option>
            {templates.filter((item) => item.isActive).map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {money(item.priceInCents)}</option>
            ))}
          </select>
          <input className="field" name="price" inputMode="decimal" placeholder="Valor negociado (opcional)" />
          <textarea className="field min-h-20" name="notes" placeholder="Observações da venda" />
          <button className="primary-button" disabled={!clientRows.length || !templates.some((item) => item.isActive)}>Vincular ao cliente</button>
        </ActionForm>}
      </div>

      <section className="panel mt-5">
        <h2 className="text-lg font-extrabold">Modelos disponíveis</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article key={template.id} className="rounded-2xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-extrabold">{template.name}</p><p className="text-sm font-bold text-brand">{money(template.priceInCents)}</p></div>
                {canManageTemplates && <ActionForm action={toggleServicePackage} successMessage={`Pacote ${template.isActive ? "desativado" : "ativado"}.`}>
                  <input type="hidden" name="id" value={template.id} />
                  <input type="hidden" name="isActive" value={template.isActive ? "false" : "true"} />
                  <button className="icon-button" aria-label={template.isActive ? "Desativar pacote" : "Ativar pacote"}>
                    {template.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                  </button>
                </ActionForm>}
              </div>
              <ul className="mt-3 grid gap-1 text-sm text-muted">
                {(itemsByTemplate.get(template.id) ?? []).map((item) => <li key={item.serviceName}>{item.quantity}× {item.serviceName}</li>)}
              </ul>
              <p className="mt-3 text-xs font-bold text-muted">{template.validityDays ? `Validade: ${template.validityDays} dias` : "Sem prazo de validade"} · {template.isActive ? "Ativo" : "Inativo"}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel mt-5">
        <h2 className="text-lg font-extrabold">Pacotes dos clientes</h2>
        <div className="mt-4 divide-y">
          {assigned.map((item) => (
            <article key={item.id} className="py-4">
              <div className="flex items-center gap-2"><PackageCheck className="size-4 text-brand" /><p className="font-extrabold">{item.client} · {item.packageName}</p></div>
              <p className="mt-1 text-xs text-muted">Adquirido em {item.purchasedAt.toLocaleDateString("pt-BR")} · {money(item.priceInCents)}{item.expiresAt ? ` · válido até ${item.expiresAt.toLocaleDateString("pt-BR")}` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(balancesByPurchase.get(item.id) ?? []).map((balance) => (
                  <span key={balance.serviceName} className="status-pill">{balance.serviceName}: {balance.total - balance.used} de {balance.total}</span>
                ))}
              </div>
            </article>
          ))}
          {!assigned.length && <p className="empty-state">Nenhum pacote vinculado a cliente.</p>}
        </div>
      </section>
    </div>
  );
}
