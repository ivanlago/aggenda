import Link from "next/link";

export const metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return <main className="min-h-screen px-6 py-12"><article className="panel mx-auto max-w-3xl">
    <Link href="/" className="font-extrabold text-brand">← Aggenda</Link>
    <h1 className="mt-8 text-4xl font-extrabold">Termos de Uso</h1>
    <p className="mt-2 text-sm text-muted">Versão de 04/08/2026</p>
    <div className="mt-8 grid gap-6 leading-7 text-muted">
      <p>O Aggenda fornece agenda, cadastros e automações de atendimento. A empresa contratante responde pelos dados cadastrados, permissões da equipe e mensagens enviadas.</p>
      <p>A assinatura é mensal e recorrente, processada pelo Asaas. Preço e condições são apresentados antes da contratação. O cancelamento interrompe renovações futuras, sem apagar automaticamente os dados.</p>
      <p>Manutenções e serviços externos podem causar interrupções. O contratante deve proteger suas credenciais e comunicar acessos indevidos.</p>
      <p>É proibido usar o serviço para fraude, spam, conteúdo ilícito ou tratamento de dados sem base legal. Violações podem resultar em suspensão.</p>
      <p>Dúvidas, cancelamentos e solicitações devem ser encaminhados pelos canais de suporte informados no aplicativo.</p>
    </div>
  </article></main>;
}
