import { CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { cancelSubscription, startCheckout } from "@/actions/billing";
import { db } from "@/db";
import { organizationSubscriptions } from "@/db/schema";
import {
  hasActiveSubscription,
  requireOrganizationMembership,
} from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
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
  assertOrganizationPermission(organization.role, "billing.manage");
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
  const asaasConfigured = Boolean(process.env.ASAAS_API_KEY);

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

        <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_420px]">
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
                ["Cobrança segura", "Pagamento recorrente processado pelo Asaas."],
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

            {subscription?.billingSubscriptionId &&
            subscription.billingProvider === "asaas" &&
            subscription.plan !== "trial" ? (
              <form action={cancelSubscription} className="mt-7">
                <button className="w-full rounded-xl border border-red-200 px-4 py-3 font-extrabold text-red-700 transition hover:bg-red-50">
                  Cancelar renovação
                </button>
              </form>
            ) : asaasConfigured ? (
              <form action={startCheckout} className="mt-7 grid gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold" htmlFor="cpfCnpj">
                    CPF ou CNPJ
                  </label>
                  <input
                    className="field"
                    id="cpfCnpj"
                    name="cpfCnpj"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Somente números"
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold" htmlFor="phoneNumber">
                      Telefone
                    </label>
                    <input
                      className="field"
                      id="phoneNumber"
                      name="phoneNumber"
                      type="tel"
                      autoComplete="tel"
                      placeholder="DDD + número"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold" htmlFor="postalCode">
                      CEP
                    </label>
                    <input
                      className="field"
                      id="postalCode"
                      name="postalCode"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="Somente números"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold" htmlFor="address">
                    Endereço
                  </label>
                  <input
                    className="field"
                    id="address"
                    name="address"
                    autoComplete="street-address"
                    placeholder="Rua ou avenida"
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold" htmlFor="addressNumber">
                      Número
                    </label>
                    <input
                      className="field"
                      id="addressNumber"
                      name="addressNumber"
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold" htmlFor="province">
                      Bairro
                    </label>
                    <input
                      className="field"
                      id="province"
                      name="province"
                      autoComplete="address-level3"
                      required
                    />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs leading-5 text-muted">
                  <input className="mt-1" type="checkbox" name="acceptTerms" required />
                  <span>Li e aceito os <Link className="font-bold text-brand underline" href="/termos" target="_blank">Termos de Uso</Link>{" "}e a <Link className="font-bold text-brand underline" href="/privacidade" target="_blank">Política de Privacidade</Link>.</span>
                </label>
                <button className="primary-button w-full">Assinar agora</button>
              </form>
            ) : (
              <div className="mt-7 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                Checkout aguardando configuração da chave Asaas.
              </div>
            )}
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              <ShieldCheck className="size-4" /> Pagamento processado pelo Asaas
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
