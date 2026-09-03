import { eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";

import { createService, deleteService, updateService } from "@/actions/app";
import { PageHeader } from "@/components/page-header";
import { TussAutocomplete } from "@/components/tuss-autocomplete";
import { db } from "@/db";
import { services } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";

export const metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "services.manage");
  const items = await db.select().from(services)
    .where(eq(services.organizationId, organization.id))
    .orderBy(services.name);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Catálogo"
        title={organization.serviceLabelPlural}
        description={`Defina duração e preço dos ${organization.serviceLabelPlural.toLowerCase()} oferecidos.`}
      />
      <div className="content-grid xl:grid-cols-2">
        {canManage && <form action={createService} className="panel form-stack">
          <h2 className="text-lg font-extrabold">
            Novo {organization.serviceLabel.toLowerCase()}
          </h2>
          <TussAutocomplete table="22" label="Guia TUSS 22 (opcional)" onSelectNameField="name" onSelectCodeField="manualTussCode" />
          <input
            className="field"
            name="name"
            required
            placeholder={`Nome do ${organization.serviceLabel.toLowerCase()}`}
          />
          <div className="grid gap-2 sm:grid-cols-2"><input className="field" name="manualTussCode" placeholder="Código TUSS (opcional)" /><input className="field" name="shortName" maxLength={80} placeholder="Nome curto, ex.: RM, USG" /></div>
          <textarea className="field min-h-24" name="preparation" placeholder="Preparação necessária para o exame/procedimento" />
          <textarea className="field min-h-20" name="description" placeholder="Descrição" />
          <input className="field" name="durationMinutes" type="number" min="5" step="5" required placeholder="Duração em minutos" />
          <input className="field" name="price" inputMode="decimal" placeholder="Preço em reais (ex.: 150,00)" />
          <input className="field" name="estimatedCost" inputMode="decimal" placeholder="Custo estimado (produtos, taxas etc.)" />
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="field" name="depositType" defaultValue="none"><option value="none">Sem sinal</option><option value="fixed">Sinal em reais</option><option value="percentage">Sinal percentual</option><option value="full">Pagamento integral</option></select>
            <input className="field" name="depositValue" type="number" min="0" placeholder="Valor em centavos ou %" />
          </div>
          <button className="primary-button">
            Adicionar {organization.serviceLabel.toLowerCase()}
          </button>
        </form>}
        <section className="panel">
          <h2 className="text-lg font-extrabold">
            {items.length}{" "}
            {(items.length === 1
              ? organization.serviceLabel
              : organization.serviceLabelPlural
            ).toLowerCase()}
          </h2>
          <div className="mt-5 divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{item.shortName || item.name}</p>
                  <p className="text-sm text-muted">
                    {item.durationMinutes} min
                    {item.priceInCents != null ? ` · ${(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}
                  </p>
                </div>
                {canManage && <details className="relative">
                  <summary className="cursor-pointer text-sm font-bold text-brand">Editar</summary>
                  <form action={updateService} className="absolute right-0 z-10 mt-2 grid w-72 gap-2 rounded-2xl border bg-white p-4 shadow-xl">
                    <input type="hidden" name="id" value={item.id} />
                    <TussAutocomplete table="22" label="Guia TUSS 22" defaultCode={item.tussCode ?? ""} defaultName={item.tussName ?? ""} onSelectNameField="name" onSelectCodeField="manualTussCode" />
                    <input className="field" name="name" defaultValue={item.name} required />
                    <div className="grid gap-2 sm:grid-cols-2"><input className="field" name="manualTussCode" defaultValue={item.tussCode ?? ""} placeholder="Código TUSS" /><input className="field" name="shortName" defaultValue={item.shortName ?? ""} placeholder="Nome curto" /></div>
                    <textarea className="field" name="preparation" defaultValue={item.preparation ?? ""} placeholder="Preparação necessária" />
                    <textarea className="field" name="description" defaultValue={item.description ?? ""} placeholder="Descrição" />
                    <input className="field" name="durationMinutes" type="number" min="5" step="5" defaultValue={item.durationMinutes} required />
                    <input className="field" name="price" inputMode="decimal" defaultValue={item.priceInCents == null ? "" : (item.priceInCents / 100).toFixed(2).replace(".", ",")} placeholder="Preço em reais" />
                    <input className="field" name="estimatedCost" inputMode="decimal" defaultValue={(item.estimatedCostInCents / 100).toFixed(2).replace(".", ",")} placeholder="Custo estimado" />
                    <select className="field" name="depositType" defaultValue={item.depositType}><option value="none">Sem sinal</option><option value="fixed">Sinal em reais</option><option value="percentage">Sinal percentual</option><option value="full">Pagamento integral</option></select>
                    <input className="field" name="depositValue" type="number" min="0" defaultValue={item.depositValue} aria-label="Valor do sinal em centavos ou percentual" />
                    <label className="flex gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={item.isActive} /> Ativo</label>
                    <button className="primary-button">Salvar</button>
                  </form>
                </details>}
                {canManage && <form action={deleteService}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label={`Excluir ${item.name}`}><Trash2 className="size-4" /></button>
                </form>}
              </div>
            ))}
            {!items.length && (
              <p className="empty-state">
                Nenhum {organization.serviceLabel.toLowerCase()} cadastrado.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
