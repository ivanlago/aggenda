import { eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";

import { createProfessional, deleteProfessional } from "@/actions/app";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Profissionais" };

export default async function ProfessionalsPage() {
  const { organization } = await requireOrganization();
  const items = await db.select().from(professionals)
    .where(eq(professionals.organizationId, organization.id))
    .orderBy(professionals.name);

  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Equipe" title="Profissionais" description="Cadastre quem presta os atendimentos do seu negócio." />
      <div className="content-grid">
        <form action={createProfessional} className="panel form-stack">
          <h2 className="text-lg font-extrabold">Novo profissional</h2>
          <input className="field" name="name" required placeholder="Nome completo" />
          <input className="field" name="title" placeholder="Cargo ou especialidade" />
          <input className="field" name="email" type="email" placeholder="E-mail" />
          <input className="field" name="phone" type="tel" placeholder="Telefone" />
          <label className="flex items-center gap-3 text-sm font-bold">Cor na agenda <input name="color" type="color" defaultValue="#18664a" /></label>
          <button className="primary-button">Adicionar profissional</button>
        </form>
        <section className="panel">
          <h2 className="text-lg font-extrabold">{items.length} profissionais</h2>
          <div className="mt-5 divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-4">
                <span className="size-3 rounded-full" style={{ backgroundColor: item.color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{item.name}</p>
                  <p className="truncate text-sm text-muted">{item.title || item.email || "Profissional"}</p>
                </div>
                <form action={deleteProfessional}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label={`Excluir ${item.name}`}><Trash2 className="size-4" /></button>
                </form>
              </div>
            ))}
            {!items.length && <p className="empty-state">Nenhum profissional cadastrado.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
