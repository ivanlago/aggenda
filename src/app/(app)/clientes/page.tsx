import { FormActions } from "@/components/form-dialog-context";
import { count } from "drizzle-orm";
import { ListPagination } from "@/components/list-pagination";
import { parseListPage, parseListPageSize } from "@/lib/list-pagination";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { Search, Trash2, X } from "lucide-react";
import Link from "next/link";

import { deleteClient } from "@/actions/app";
import { ClientFormFields } from "@/components/client-form-fields";
import { NewClientForm } from "@/components/new-client-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clients } from "@/db/schema";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { EntityThumbnail } from "@/components/entity-image-field";

export const metadata = { title: "Clientes" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string; linhas?: string }>;
}) {
  const { session, organization } = await requireOrganization();
  const professionalScopeId = organization.role === "professional"
    ? await requireProfessionalScope(organization.id, session.user.id)
    : null;
  const canManage = hasOrganizationPermission(organization.role, "clients.manage", organization.teamPermissionOverrides);
  const query = await searchParams;
  const search = String(query.busca ?? "").trim().slice(0, 100);
  const condition =
      and(
        eq(clients.organizationId, organization.id),
        professionalScopeId ? inArray(clients.id, db.select({ id: appointments.clientId }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.professionalId, professionalScopeId)))) : undefined,
        search ? ilike(clients.name, `%${search}%`) : undefined
      );
  const [{ total }] = await db.select({ total: count() }).from(clients).where(condition);
  const pageSize = parseListPageSize(query.linhas);
  const page = Math.min(parseListPage(query.pagina), Math.max(1, Math.ceil(total / pageSize)));
  const items = await db.select().from(clients).where(condition).orderBy(clients.name, clients.id).limit(pageSize).offset((page - 1) * pageSize);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Relacionamento"
        title={organization.clientLabelPlural}
        description={`Mantenha ${organization.clientLabelPlural.toLowerCase()} e observações importantes organizados.`}
        actions={canManage && <NewClientForm clientLabel={organization.clientLabel}>

          <ClientFormFields clientLabel={organization.clientLabel} />
          <FormActions />
        </NewClientForm>}
      />
      <div className="grid min-w-0 gap-5">

        <section className="panel">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-extrabold">
              {total}{" "}
              {(total === 1
                ? organization.clientLabel
                : organization.clientLabelPlural
              ).toLowerCase()}
              {search ? " encontrados" : ""}
            </h2>
            <form method="get" className="flex gap-2" role="search"><input type="hidden" name="linhas" value={pageSize} />
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
                  <p className="truncate text-xs text-slate-600 leading-5 font-medium">{formatPhone(item.phone) || item.email || "Sem contato informado"}</p>

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
          <ListPagination path="/clientes" query={{ busca: search }} page={page} total={total} pageSize={pageSize} />
        </section>
      </div>
    </div>
  );
}
