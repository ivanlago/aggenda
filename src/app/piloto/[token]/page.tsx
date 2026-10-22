import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pilotInvitations } from "@/db/schema";
import { acceptPilotInvitation } from "@/actions/commercial-checkout";
import Link from "next/link";

export const metadata = { title: "Convite para o piloto Aggenda", robots: { index: false, follow: false } };
export default async function PilotPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite] = /^[a-f0-9]{64}$/.test(token) ? await db.select({ id: pilotInvitations.id }).from(pilotInvitations).where(and(
    eq(pilotInvitations.tokenHash, createHash("sha256").update(token).digest("hex")), gt(pilotInvitations.expiresAt, new Date()),
    isNull(pilotInvitations.revokedAt), isNull(pilotInvitations.redeemedAt))) : [];
  return <main className="mx-auto max-w-2xl px-6 py-16"><Link href="/" className="font-extrabold text-brand">Aggenda</Link>
    <h1 className="mt-8 text-3xl font-extrabold">{invite ? "Seu convite para o Aggenda Completo" : "Convite indisponível"}</h1>
    {invite ? <><p className="mt-5">R$ 5,00 em pagamento único por um ano. Sem renovação automática.</p>
      <p className="mt-3">Até três profissionais. A cada mês: 1.000 respostas da Secretária, 30 documentos enviados para assinatura e dez notas nacionais autorizadas, após habilitação fiscal. Franquias não acumulam.</p>
      <p className="mt-3">Você participará dos testes das ferramentas atuais e futuras durante esse ano, conforme disponibilização. NFS-e em produção aguarda homologação; serviços externos dependem de configuração.</p>
      <p className="mt-3">Use o e-mail que recebeu o convite para criar sua conta ou entrar. Após o pagamento confirmado, siga a implantação guiada.</p>
      <form action={acceptPilotInvitation} className="mt-8"><input type="hidden" name="token" value={token} /><button className="primary-button">Acessar convite e criar minha conta</button></form>
    </> : <p className="mt-5">Este convite expirou, foi utilizado ou foi revogado. Solicite um novo convite à equipe.</p>}
  </main>;
}
