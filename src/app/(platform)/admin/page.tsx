import { count } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { clients, organizations, services, users } from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";

export const metadata = { title: "Administração SaaS" };

export default async function PlatformAdminPage() {
  await requirePlatformMember();
  const [[companyCount], [userCount], [clientCount], [serviceCount]] = await Promise.all([
    db.select({ value: count() }).from(organizations),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(clients),
    db.select({ value: count() }).from(services),
  ]);
  const cards = [
    ["Empresas", companyCount.value, "/admin/empresas"],
    ["Usuários", userCount.value, "/admin/usuarios"],
    ["Clientes finais", clientCount.value, "/admin/empresas"],
    ["Serviços", serviceCount.value, "/admin/empresas"],
  ] as const;
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Plataforma</p>
      <h1 className="mt-2 text-3xl font-extrabold">Administração do SaaS</h1>
      <p className="mt-2 text-muted">Visão global separada das permissões de cada empresa.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link className="panel" href={href} key={label}>
            <p className="text-sm font-bold text-muted">{label}</p>
            <p className="mt-3 text-3xl font-extrabold">{value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
