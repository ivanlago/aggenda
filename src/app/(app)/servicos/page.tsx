import { eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";

import { createService, deleteService } from "@/actions/app";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { services } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const { organization } = await requireOrganization();
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
      <div className="content-grid">
        <form action={createService} className="panel form-stack">
          <h2 className="text-lg font-extrabold">
            Novo {organization.serviceLabel.toLowerCase()}
          </h2>
          <input
            className="field"
            name="name"
            required
            placeholder={`Nome do ${organization.serviceLabel.toLowerCase()}`}
          />
          <textarea className="field min-h-20" name="description" placeholder="Descrição" />
          <input className="field" name="durationMinutes" type="number" min="5" step="5" required placeholder="Duração em minutos" />
          <input className="field" name="priceInCents" type="number" min="0" placeholder="Preço em centavos (ex.: 15000)" />
          <button className="primary-button">
            Adicionar {organization.serviceLabel.toLowerCase()}
          </button>
        </form>
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
                  <p className="font-bold">{item.name}</p>
                  <p className="text-sm text-muted">
                    {item.durationMinutes} min
                    {item.priceInCents != null ? ` · ${(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}
                  </p>
                </div>
                <form action={deleteService}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label={`Excluir ${item.name}`}><Trash2 className="size-4" /></button>
                </form>
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
