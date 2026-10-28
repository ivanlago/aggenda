import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { paymentConnectionGuides } from "@/lib/payment-connection-guides";
import { requireOrganization } from "@/lib/session";

type Props = { params: Promise<{ instituicao: string }> };
const getGuide = (slug: string) => Object.hasOwn(paymentConnectionGuides, slug) ? paymentConnectionGuides[slug] : undefined;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getGuide((await params).instituicao);
  return { title: guide ? `Passo a passo — ${guide.name}` : "Guia de pagamentos" };
}

export default async function PaymentConnectionGuidePage({ params }: Props) {
  const { organization } = await requireOrganization();
  const guide = getGuide((await params).instituicao);
  if (!guide) notFound();
  const webhookUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "")}/api/webhooks/mercado-pago?organizationId=${organization.id}`;
  const backUrl = `/configuracoes?aba=payments&instituicao=${guide.tabId}`;

  return <div className="page-wrap max-w-4xl">
    <Link className="mb-4 inline-flex text-sm font-bold text-brand" href={backUrl}>← Voltar para {guide.name} em Pagamentos</Link>
    <PageHeader eyebrow="Guia de pagamentos" title={`${guide.name}: passo a passo`} description={guide.intro} />
    <p className="mb-5 text-xs text-muted">Atualizado em 22/10/2026 · Os nomes dos menus da instituição podem mudar.</p>
    <section className="panel mb-5">
      <h2 className="text-lg font-extrabold">Antes de começar</h2>
      <p className="mt-2 text-sm leading-6">{guide.mode === "connection" ? "Use a conta que receberá o dinheiro dos seus clientes. Produção movimenta dinheiro real; Testes / Homologação exige credenciais próprias desse ambiente. Guarde as chaves e preencha somente os campos de conexão do Aggenda; não as envie por WhatsApp, e-mail ou conversa de suporte." : "Tenha acesso ao extrato do banco que recebe os depósitos e aos lançamentos financeiros da empresa. Você não precisa fornecer senha bancária nem credenciais da maquininha ao Aggenda."}</p>
      {guide.links.length > 0 && <div className="mt-4 flex flex-wrap gap-3">{guide.links.map(link => <a key={link.href} className="text-sm font-bold text-brand underline underline-offset-4" href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>}
    </section>
    <ol className="grid gap-4">
      {guide.steps.map((step, index) => <li key={step.title} className="panel">
        <h2 className="text-lg font-extrabold"><span className="mr-2 text-brand">{index + 1}.</span>{step.title}</h2>
        <p className="mt-2 text-sm leading-7">{step.text}</p>
        {step.webhook && <div className="mt-4 rounded-xl border bg-slate-50 p-4">
          <p className="text-sm font-bold">URL de notificação da sua empresa</p>
          <p className="mt-1 text-xs text-muted">Copie o endereço inteiro, incluindo organizationId. Ele identifica a empresa em que você está conectado.</p>
          <code className="my-3 block break-all text-sm">{webhookUrl}</code>
          <CopyButton value={webhookUrl} label="Copiar URL do webhook" />
        </div>}
      </li>)}
    </ol>
    {guide.mode === "connection" && <section className="panel mt-5">
      <h2 className="text-lg font-extrabold">Como testar de ponta a ponta</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-7">
        <li>Em Contas e fluxo de caixa, cadastre uma conta a receber pendente, de pequeno valor, com descrição de teste e vencimento futuro. Use dados corretos do pagador.</li>
        <li>Em Pagamentos → Emitir novo pagamento, escolha {guide.name}, selecione essa conta a receber e clique em Gerar pagamento.</li>
        <li>Abra o link ou QR Code e confira recebedor, descrição e valor. Em Produção, prossiga apenas se quiser efetuar esse pagamento real. Não repita uma cobrança já paga.</li>
        <li>Após a aprovação na instituição, atualize Pagamentos. Confira Pago e o histórico da confirmação. Em Contas e fluxo de caixa, confira Recebido, sem baixa manual.</li>
      </ol>
      <p className="mt-4 text-sm font-bold">O botão Testar conexão atual valida o acesso. O teste completo acima valida também a confirmação automática. Um teste Pix não valida automaticamente cartão, boleto, recorrência ou estorno.</p>
    </section>}
    <section className="panel mt-5">
      <h2 className="text-lg font-extrabold">Se algo não funcionar</h2>
      <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-7">{guide.troubleshooting.map(text => <li key={text}>{text}</li>)}</ul>
    </section>
    <div className="my-5 flex flex-wrap gap-3"><Link className="primary-button" href={backUrl}>Voltar à aba {guide.name}</Link>{guide.mode === "reconciliation" && <Link className="secondary-button" href="/financeiro/conciliacao-ofx">Abrir conciliação OFX</Link>}</div>
  </div>;
}
