import { and, eq, ilike } from "drizzle-orm";
import { Pencil, Search, Trash2, X } from "lucide-react";
import Link from "next/link";

import { createClient, deleteClient, updateClient } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Clientes" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>;
}) {
  const { organization } = await requireOrganization();
  const query = await searchParams;
  const search = String(query.busca ?? "").trim().slice(0, 100);
  const items = await db.select().from(clients)
    .where(
      and(
        eq(clients.organizationId, organization.id),
        search ? ilike(clients.name, `%${search}%`) : undefined
      )
    )
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
          <label className="grid gap-2 text-sm font-bold">Data de nascimento<input className="field" name="birthDate" type="date" /></label>
          <select className="field" name="gender" defaultValue="">
            <option value="">Sexo não informado</option>
            <option value="female">Feminino</option>
            <option value="male">Masculino</option>
            <option value="other">Outro</option>
            <option value="not_informed">Prefere não informar</option>
          </select>
          <textarea className="field min-h-24" name="notes" placeholder="Observações" />
          <button className="primary-button">
            Adicionar {organization.clientLabel.toLowerCase()}
          </button>
        </form>
        <section className="panel">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-extrabold">
              {items.length}{" "}
              {(items.length === 1
                ? organization.clientLabel
                : organization.clientLabelPlural
              ).toLowerCase()}
              {search ? " encontrados" : ""}
            </h2>
            <form method="get" className="flex gap-2" role="search">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Buscar por nome</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  className="field w-full pl-10"
                  name="busca"
                  defaultValue={search}
                  placeholder={`Buscar ${organization.clientLabel.toLowerCase()} por nome`}
                  maxLength={100}
                  autoComplete="off"
                />
              </label>
              <button className="primary-button px-4" type="submit">
                Buscar
              </button>
              {search && (
                <Link
                  className="icon-button"
                  href="/clientes"
                  aria-label="Limpar busca"
                  title="Limpar busca"
                >
                  <X className="size-4" />
                </Link>
              )}
            </form>
          </div>
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
                      <input className="field py-2" name="birthDate" type="date" defaultValue={item.birthDate ?? ""} aria-label="Data de nascimento" />
                      <select className="field py-2" name="gender" defaultValue={item.gender ?? ""} aria-label="Sexo">
                        <option value="">Sexo não informado</option>
                        <option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="not_informed">Prefere não informar</option>
                      </select>
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
                {search
                  ? `Nenhum ${organization.clientLabel.toLowerCase()} encontrado para “${search}”.`
                  : `Nenhum ${organization.clientLabel.toLowerCase()} cadastrado.`}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
