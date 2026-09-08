import { and, eq, ilike, inArray } from "drizzle-orm";
import { Search, Trash2, X } from "lucide-react";
import Link from "next/link";

import { deleteClient } from "@/actions/app";
import { ClientOptionalFields } from "@/components/client-optional-fields";
import { NewClientForm } from "@/components/new-client-form";
import { PageHeader } from "@/components/page-header";
import { PhoneInput } from "@/components/phone-input";
import { db } from "@/db";
import { appointments, clients } from "@/db/schema";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { EntityImageField, EntityThumbnail } from "@/components/entity-image-field";

export const metadata = { title: "Clientes" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>;
}) {
  const { session, organization } = await requireOrganization();
  const professionalScopeId = organization.role === "professional"
    ? await requireProfessionalScope(organization.id, session.user.id)
    : null;
  const canManage = hasOrganizationPermission(organization.role, "clients.manage");
  const query = await searchParams;
  const search = String(query.busca ?? "").trim().slice(0, 100);
  const items = await db.select().from(clients)
    .where(
      and(
        eq(clients.organizationId, organization.id),
        professionalScopeId ? inArray(clients.id, db.select({ id: appointments.clientId }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.professionalId, professionalScopeId)))) : undefined,
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
      <div className="grid min-w-0 gap-5">
        {canManage && <NewClientForm>
          <h2 className="text-lg font-extrabold sm:col-span-2 lg:col-span-3">
            Novo {organization.clientLabel.toLowerCase()}
          </h2>
          <label className="grid min-w-0 gap-2 text-sm font-bold">Nome completo<input className="field" name="name" required placeholder="Nome completo" autoComplete="name" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold">Telefone<PhoneInput name="phone" placeholder="(71) 99999-9999" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold">E-mail<input className="field" name="email" type="email" placeholder="E-mail" /></label>
          <label className="grid gap-2 text-sm font-bold">Data de nascimento<input className="field" name="birthDate" type="date" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold">Sexo<select className="field" name="gender" defaultValue="">
            <option value="">Sexo não informado</option>
            <option value="female">Feminino</option>
            <option value="male">Masculino</option>
            <option value="other">Outro</option>
            <option value="not_informed">Prefere não informar</option>
          </select></label>
          <div className="sm:col-span-2 lg:col-span-3"><ClientOptionalFields /></div>
          <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2 lg:col-span-3">Observações<textarea className="field min-h-24" name="notes" placeholder="Observações" /></label>
          <div className="min-w-0 sm:col-span-2 lg:col-span-3"><EntityImageField label={`Foto do ${organization.clientLabel.toLowerCase()}`} /></div>
          <button className="primary-button justify-self-start sm:col-span-2 lg:col-span-3">
            Adicionar {organization.clientLabel.toLowerCase()}
          </button>
        </NewClientForm>}
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
                <EntityThumbnail src={item.imageUrl} alt={item.name} fallback={item.name[0]} />
                <div className="min-w-0 flex-1">
                  <Link className="font-bold hover:text-brand" href={`/clientes/${item.id}`}>
                    {item.name}
                  </Link>
                  <p className="truncate text-sm text-muted">{formatPhone(item.phone) || item.email || "Sem contato informado"}</p>

                </div>
                {canManage && <form action={deleteClient}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label={`Excluir ${item.name}`}><Trash2 className="size-4" /></button>
                </form>}
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
