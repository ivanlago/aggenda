import { PaginatedCollection } from "@/components/paginated-collection";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { pilotInvitations } from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";
import { createPilotInvitation, revokePilotInvitation } from "@/actions/commercial-checkout";

export const metadata = { title: "Convites do piloto", robots: { index: false, follow: false } };
export default async function PilotInvitationsPage({ searchParams }: { searchParams: Promise<{ convite?: string }> }) {
  await requirePlatformMember(["super_admin", "billing"]);
  const { convite } = await searchParams;
  const invitations = await db.select().from(pilotInvitations).orderBy(desc(pilotInvitations.createdAt)).limit(50);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.aggenda.app.br";
  const url = convite && /^[a-f0-9]{64}$/.test(convite) ? `${base.replace(/\/$/, "")}/piloto/${convite}` : null;
  return <main className="mx-auto max-w-4xl p-8"><Link href="/dashboard" className="text-brand">← Painel</Link>
    <h1 className="mt-6 text-3xl font-extrabold">Convites para o piloto anual</h1>
    <p className="mt-3">R$ 5,00 por um ano do Completo. Convite individual vinculado ao e-mail, válido por 14 dias. Envie o link ao cliente; não há envio automático.</p>
    <form action={createPilotInvitation} className="mt-6 flex flex-wrap gap-3"><label className="grow font-bold">E-mail do proprietário<input className="field mt-2" type="email" name="email" required /></label><button className="primary-button self-end">Gerar convite</button></form>
    {url && <section className="panel mt-6"><h2 className="font-bold">Link criado — copie e envie ao cliente</h2><input aria-label="Link do convite" className="field mt-3" value={url} readOnly /><p className="mt-2 text-sm">O link completo é exibido somente agora.</p></section>}
    <section className="mt-8 grid gap-3"><PaginatedCollection label="Registros" className="mt-3">{invitations.map((invite) => <article className="panel flex flex-wrap justify-between gap-3" key={invite.id}>
      <div><strong>{invite.email}</strong><p className="text-sm">{invite.redeemedAt ? "Utilizado" : invite.revokedAt ? "Revogado" : invite.expiresAt < new Date() ? "Expirado" : "Disponível"} · válido até {invite.expiresAt.toLocaleDateString("pt-BR")}</p></div>
      {!invite.redeemedAt && !invite.revokedAt && <form action={revokePilotInvitation}><input type="hidden" name="id" value={invite.id} /><button className="secondary-button">Revogar</button></form>}
    </article>)}</PaginatedCollection></section>
  </main>;
}
