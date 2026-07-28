import { CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { openBillingPortal, startCheckout } from "@/actions/billing";
import { db } from "@/db";
import { organizationSubscriptions } from "@/db/schema";
import {
  hasActiveSubscription,
  requireOrganizationMembership,
} from "@/lib/session";
import { eq } from "drizzle-orm";

export const metadata = { title: "Plano e cobrança" };

const statusLabels = {
  trialing: "Período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  incomplete: "Pagamento incompleto",
};

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { organization } = await requireOrganizationMembership();
  const [subscription] = await db
    .select()
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, organization.id))
    .limit(1);
  const { checkout } = await searchParams;
  const active = subscription ? hasActiveSubscription({
    subscriptionStatus: subscription.status,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
  }) : false;
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ESSENTIAL
  );

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <Link href={active ? "/dashboard" : "/"} className="font-extrabold text-brand">
            ← Aggenda
          </Link>
          <span className="status-pill">
            {subscription ? statusLabels[subscription.status] : "Sem plano"}
          </span>
        </div>

        {checkout === "sucesso" && (
          <div className="mt-8 rounded-2xl bg-[#edf7f1] p-4 font-bold text-brand">
            Pagamento recebido. A ativação será confirmada em instantes.
          </div>
        )}

        <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-brand">
              Plano e cobrança
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight">
              Continue movimentando seu negócio.
            </h1>
            <p className="mt-4 max-w-xl leading-7 text-muted">
              A assinatura pertence a {organization.name} e mantém toda a equipe,
              agenda e histórico disponíveis.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ["Organização isolada", "Seus dados separados de outras empresas."],
                ["Equipe com permissões", "Contas individuais para cada pessoa."],
                ["Cobrança segura", "Pagamento e notas gerenciados pela Stripe."],
                ["Histórico preservado", "Seus dados permanecem vinculados à empresa."],
              ].map(([title, description]) => (
                <div key={title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand" />
                  <div><p className="font-bold">{title}</p><p className="mt-1 text-sm text-muted">{description}</p></div>
                </div>
              ))}
            </div>
          </div>

          <aside className="panel">
            <CreditCard className="size-6 text-brand" />
            <p className="mt-6 text-sm font-extrabold uppercase tracking-widest text-brand">
              Plano Essencial
            </p>
            <p className="mt-2 text-3xl font-extrabold">
              {process.env.NEXT_PUBLIC_PLAN_PRICE || "R$ 99"}
              <span className="text-sm font-semibold text-muted">/mês</span>
            </p>
            <ul className="mt-6 grid gap-3 text-sm">
              <li>Agenda, clientes e serviços</li>
              <li>Profissionais e equipe</li>
              <li>Confirmações e integrações</li>
            </ul>

            {subscription?.stripeCustomerId && subscription.plan !== "trial" ? (
              <form action={openBillingPortal} className="mt-7">
                <button className="primary-button w-full">Gerenciar assinatura</button>
              </form>
            ) : stripeConfigured ? (
              <form action={startCheckout} className="mt-7">
                <button className="primary-button w-full">Assinar agora</button>
              </form>
            ) : (
              <div className="mt-7 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                Checkout aguardando configuração das chaves Stripe.
              </div>
            )}
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              <ShieldCheck className="size-4" /> Pagamento processado pela Stripe
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
