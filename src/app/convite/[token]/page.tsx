import { eq } from "drizzle-orm";
import Link from "next/link";

import { acceptInvitation } from "@/actions/team";
import { db } from "@/db";
import { organizationInvitations, organizations } from "@/db/schema";
import { getSession } from "@/lib/session";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();
  const [invitation] = await db
    .select({
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      expiresAt: organizationInvitations.expiresAt,
      acceptedAt: organizationInvitations.acceptedAt,
      organizationName: organizations.name,
    })
    .from(organizationInvitations)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationInvitations.organizationId)
    )
    .where(eq(organizationInvitations.token, token))
    .limit(1);

  const invalid =
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date();

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <section className="panel w-full max-w-lg text-center">
        <p className="text-sm font-extrabold uppercase tracking-widest text-brand">Convite Aggenda</p>
        <h1 className="mt-4 text-3xl font-extrabold">
          {invalid ? "Este convite não está mais disponível" : `Entre para ${invitation.organizationName}`}
        </h1>
        {!invalid && (
          <>
            <p className="mt-4 text-muted">
              O convite foi enviado para <strong>{invitation.email}</strong> com perfil {invitation.role}.
            </p>
            {session?.user.email.toLowerCase() === invitation.email ? (
              <form action={acceptInvitation.bind(null, token)} className="mt-7">
                <button className="primary-button w-full">Aceitar convite</button>
              </form>
            ) : (
              <Link
                className="primary-button mt-7 inline-block w-full"
                href={`/entrar?callbackURL=${encodeURIComponent(`/convite/${token}`)}`}
              >
                Entrar com o e-mail convidado
              </Link>
            )}
          </>
        )}
        {invalid && <Link href="/" className="mt-7 inline-block font-bold text-brand">Voltar ao início</Link>}
      </section>
    </main>
  );
}
