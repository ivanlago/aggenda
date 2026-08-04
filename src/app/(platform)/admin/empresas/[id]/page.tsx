import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { startSupportSession } from "@/actions/access";
import { db } from "@/db";
import {
  clients,
  organizationMembers,
  organizations,
  services,
  supportSessions,
  users,
} from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";

function maskPhone(value: string | null) {
  if (!value) return "—";
  return value.length > 4 ? `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : "••••";
}

export default async function CompanyAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { platform } = await requirePlatformMember();
  const { id } = await params;
  const [[organization], members, clientItems, serviceItems, activeSupport] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, id)).limit(1),
    db.select({ name: users.name, email: users.email, role: organizationMembers.role }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, id)),
    db.select({ id: clients.id, name: clients.name, phone: clients.phone, email: clients.email }).from(clients).where(eq(clients.organizationId, id)).limit(100),
    db.select({ id: services.id, name: services.name, isActive: services.isActive }).from(services).where(eq(services.organizationId, id)).limit(100),
    db.select().from(supportSessions).where(and(eq(supportSessions.organizationId, id), isNull(supportSessions.endedAt))).limit(10),
  ]);
  if (!organization) notFound();
  const canStartSupport = ["super_admin", "support", "operations"].includes(platform.role);
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Empresa</p>
      <h1 className="mt-2 text-3xl font-extrabold">{organization.name}</h1>
      <p className="mt-2 text-muted">{organization.slug} · {organization.businessType ?? "segmento não informado"}</p>
      {canStartSupport && <form action={startSupportSession} className="panel mt-6 grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <input type="hidden" name="organizationId" value={id} />
        <input className="field" name="reason" minLength={10} required placeholder="Motivo detalhado do atendimento de suporte" />
        <select className="field" name="accessLevel" defaultValue="read_only"><option value="read_only">Somente leitura</option>{platform.role === "super_admin" && <option value="operational">Operacional</option>}</select>
        <button className="primary-button">Iniciar sessão de 1 hora</button>
      </form>}
      {activeSupport.length > 0 && <p className="mt-3 text-sm font-bold text-amber-700">Existem {activeSupport.length} sessões de suporte registradas para esta empresa.</p>}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="panel"><h2 className="text-xl font-extrabold">Equipe</h2><div className="mt-4 divide-y">{members.map((member) => <div className="py-3" key={member.email}><p className="font-bold">{member.name}</p><p className="text-sm text-muted">{member.email} · {member.role}</p></div>)}</div></section>
        <section className="panel"><h2 className="text-xl font-extrabold">Serviços</h2><div className="mt-4 divide-y">{serviceItems.map((service) => <div className="flex justify-between py-3" key={service.id}><span className="font-bold">{service.name}</span><span className="text-sm text-muted">{service.isActive ? "ativo" : "inativo"}</span></div>)}</div></section>
        <section className="panel lg:col-span-2"><h2 className="text-xl font-extrabold">Clientes finais</h2><p className="mt-1 text-xs text-muted">Dados de contato mascarados no suporte global.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{clientItems.map((client) => <div className="rounded-xl border p-3" key={client.id}><p className="font-bold">{client.name}</p><p className="text-sm text-muted">{maskPhone(client.phone)} · {client.email ? client.email.replace(/(^.).*(@.*$)/, "$1•••$2") : "sem e-mail"}</p></div>)}</div></section>
      </div>
    </div>
  );
}
