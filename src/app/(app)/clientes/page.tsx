import { eq } from "drizzle-orm";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

import { createClient, deleteClient, updateClient } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Clientes" };

export default async function ClientsPage() {
  const { organization } = await requireOrganization();
  const items = await db.select().from(clients)
    .where(eq(clients.organizationId, organization.id))
    .orderBy(clients.name);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Relacionamento"
        title={organization.clientLabelPlural}
        description={`Mantenha ${organization.clientLabelPlural.toLowerCase()} e observações importantes organizados.`}
      />
      <div className="content-grid">
        <form action={createClient} className="panel form-stack">
          <h2 className="text-lg font-extrabold">
            Novo {organization.clientLabel.toLowerCase()}
          </h2>
          <input className="field" name="name" required placeholder="Nome completo" />
          <input className="field" name="phone" type="tel" placeholder="Telefone" />
          <input className="field" name="email" type="email" placeholder="E-mail" />
          <textarea className="field min-h-24" name="notes" placeholder="Observações" />
          <button className="primary-button">
            Adicionar {organization.clientLabel.toLowerCase()}
          </button>
        </form>
        <section className="panel">
          <h2 className="text-lg font-extrabold">
            {items.length}{" "}
            {(items.length === 1
              ? organization.clientLabel
              : organization.clientLabelPlural
            ).toLowerCase()}
          </h2>
          <div className="mt-5 divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-4">
                <span className="grid size-10 place-items-center rounded-full bg-[#edf7f1] font-extrabold text-brand">{item.name[0]}</span>
                <div className="min-w-0 flex-1">
                  <Link className="font-bold hover:text-brand" href={`/clientes/${item.id}`}>
                    {item.name}
                  </Link>
                  <p className="truncate text-sm text-muted">{item.phone || item.email || "Sem contato informado"}</p>
                  <details className="mt-2">
                    <summary className="flex w-fit items-center gap-1 text-xs font-extrabold text-brand">
                      <Pencil className="size-3" /> Editar dados
                    </summary>
                    <ActionForm action={updateClient} successMessage="Cliente atualizado com sucesso." className="mt-3 grid gap-2 rounded-2xl border bg-white p-4">
                      <input type="hidden" name="id" value={item.id} />
                      <input className="field py-2" name="name" defaultValue={item.name} required />
                      <input className="field py-2" name="phone" type="tel" defaultValue={item.phone ?? ""} placeholder="Telefone" />
                      <input className="field py-2" name="email" type="email" defaultValue={item.email ?? ""} placeholder="E-mail" />
                      <textarea className="field min-h-20 py-2" name="notes" defaultValue={item.notes ?? ""} placeholder="Observações" />
                      <button className="primary-button py-2">Salvar alterações</button>
                    </ActionForm>
                  </details>
                </div>
                <form action={deleteClient}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label={`Excluir ${item.name}`}><Trash2 className="size-4" /></button>
                </form>
              </div>
            ))}
            {!items.length && (
              <p className="empty-state">
                Nenhum {organization.clientLabel.toLowerCase()} cadastrado.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
