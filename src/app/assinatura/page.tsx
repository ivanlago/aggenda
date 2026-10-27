import Link from "next/link";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { billingPayments, organizationSubscriptions, pilotInvitations } from "@/db/schema";
import { requireOrganizationMembership, getPlatformMembership } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { commercialUsageSummary } from "@/lib/commercial-access";
import { formatBrl } from "@/lib/commercial-catalog";
import { cancelSubscription } from "@/actions/billing";
import { CommercialCheckout } from "@/components/commercial-checkout";
import { SubscriptionRefresh } from "./subscription-refresh";

export const metadata = { title: "Plano e cobrança do Aggenda" };
export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ checkout?: string; message?: string; piloto?: string; product?: string; cycle?: string }> }) {
  const { organization, session } = await requireOrganizationMembership();
  assertOrganizationPermission(organization.role, "billing.manage");
  const query = await searchParams;
  const pilotToken = (await cookies()).get("aggenda_pilot")?.value;
  const [invitation] = pilotToken ? await db.select().from(pilotInvitations).where(eq(pilotInvitations.tokenHash, createHash("sha256").update(pilotToken).digest("hex"))) : [];
  const hasPilot = Boolean(invitation && !invitation.revokedAt && !invitation.redeemedAt && invitation.expiresAt > new Date()
    && invitation.email === session.user.email.toLowerCase() && (!invitation.organizationId || invitation.organizationId === organization.id));
  const initialProduct = query.product === "complete" || query.product === "professional" ? query.product : "essential";
  const initialCycle = query.cycle === "annual" || query.cycle === "semiannual" ? query.cycle : "monthly";
  const [[subscription], payments, usage, platform] = await Promise.all([
    db.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.organizationId, organization.id)).limit(1),
    db.select().from(billingPayments).where(eq(billingPayments.organizationId, organization.id)).orderBy(desc(billingPayments.createdAt)).limit(10),
    commercialUsageSummary(organization.id), getPlatformMembership(session.user.id),
  ]);
  const paid = usage?.contract.kind !== "trial" && Boolean(usage && usage.contract.endsAt > new Date());
  const trial = subscription?.status === "trialing" && subscription.trialEndsAt && subscription.trialEndsAt > new Date();
  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
    <SubscriptionRefresh enabled={query.checkout === "sucesso" && !paid} confirmed={query.checkout === "sucesso" && paid} />
    <Link href="/dashboard" className="font-extrabold text-brand">← Aggenda</Link>
    <h1 className="mt-8 text-4xl font-extrabold">Plano e cobrança do Aggenda</h1>
    <p className="mt-3 text-muted">Gerencie a assinatura do Aggenda para {organization.name}: plano, profissionais, adicionais e pagamentos.</p>
    {platform && ["super_admin", "billing"].includes(platform.role) && <Link href="/plataforma/convites-piloto" className="mt-4 inline-block font-bold text-brand underline">Gerenciar convites do piloto anual</Link>}
    {query.checkout === "sucesso" && <p role="status" className="mt-6 rounded-2xl bg-brand/5 p-5 font-bold">{paid ? "Pagamento confirmado. Seu Aggenda está liberado!" : "Aguardando confirmação do pagamento pelo Asaas. A página será atualizada automaticamente."}</p>}
    {query.checkout === "erro" && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-5 text-red-800">{query.message ?? "Não foi possível preparar seu pagamento."}</p>}
    {trial && <section className="panel mt-6"><h2 className="text-xl font-extrabold">Seu teste de 30 dias está ativo</h2>
      <p className="mt-2">Até {subscription!.trialEndsAt!.toLocaleDateString("pt-BR")}, sem cartão e sem cobrança automática. Até três profissionais, 1.000 respostas, 30 documentos enviados para assinatura e dez notas nacionais autorizadas após habilitação fiscal. NFS-e em produção aguarda homologação.</p>
      <Link href="/dashboard" className="primary-button mt-4 inline-flex">Continuar implantação e testar grátis</Link>
      <p className="mt-3 text-sm">Você pode escolher uma contratação abaixo quando desejar. Pagar agora inicia o período contratado.</p>
    </section>}
    {usage && <section className="panel mt-6"><h2 className="text-xl font-extrabold">{usage.contract.kind === "pilot" ? "Piloto anual — Completo" : usage.contract.kind === "trial" ? "Franquias do teste" : `Plano ${usage.contract.product === "complete" ? "Completo" : usage.contract.product === "professional" ? "Profissional" : "Essencial"}`}</h2>
      <p className="mt-2">Acesso até {usage.contract.endsAt.toLocaleDateString("pt-BR")} · até {usage.contract.professionalLimit} profissionais</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{([
        ["responses", "Respostas", usage.available.responses], ["documents", "Documentos", usage.available.documents], ["notes", "Notas autorizadas", usage.available.notes],
      ] as const).map(([metric, label, limit]) => { const used = usage.quantities[metric] ?? 0; const percent = limit ? used / limit * 100 : 0;
        return <div key={metric} className="rounded-xl border p-4"><strong>{label}: {used}/{limit}</strong>
          <p className="mt-2 text-sm">{percent >= 100 ? "100%: novas operações pausadas." : percent >= 95 ? "95% ou mais: próximo do limite." : percent >= 80 ? "80% ou mais da franquia utilizada." : "Franquia disponível."}</p></div>;
      })}</div>
      <p className="mt-3 text-sm text-muted">Franquias não acumulam. Documentos aguardando assinatura reservam unidades para permitir a conclusão. Registros e documentos enviados permanecem acessíveis ao atingir o limite.</p>
    </section>}
    {subscription?.billingSubscriptionId && !subscription.cancelAtPeriodEnd && <form action={cancelSubscription} className="mt-5"><button className="secondary-button">Cancelar renovação mensal</button></form>}
    {query.piloto === "1" && !hasPilot && !paid && <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4">Abra um convite válido usando o e-mail do proprietário indicado para acessar o piloto anual.</p>}
    {!paid && <section className="panel mt-8"><h2 className="mb-6 text-2xl font-extrabold">{hasPilot ? "Condições do seu convite" : "Escolha sua contratação"}</h2><CommercialCheckout pilot={hasPilot} disabled={!process.env.ASAAS_API_KEY} initialProduct={initialProduct} initialCycle={initialCycle} />
      {!process.env.ASAAS_API_KEY && <p className="mt-4 text-amber-800">Pagamento aguardando configuração do Asaas.</p>}
    </section>}
    {usage && usage.contract.endsAt > new Date() && <details className="panel mt-8"><summary className="cursor-pointer font-extrabold">Comprar respostas ou documentos adicionais</summary><div className="mt-6"><CommercialCheckout extras disabled={!process.env.ASAAS_API_KEY} /></div></details>}
    {paid && <p className="mt-6">Para ampliar a equipe ou alterar módulos, fale com a equipe. Sua contratação atual permanece ativa até a data indicada.</p>}
    {payments.length > 0 && <section className="panel mt-8"><h2 className="text-xl font-extrabold">Histórico de pagamentos</h2>{payments.map((payment) => <div className="mt-3 flex justify-between border-t pt-3" key={payment.id}><span>{payment.createdAt.toLocaleDateString("pt-BR")} · {payment.status === "paid" ? "Pago" : payment.status}</span><strong>{payment.amountInCents == null ? "—" : formatBrl(payment.amountInCents)}</strong></div>)}</section>}
  </main>;
}
