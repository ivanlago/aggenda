import Link from "next/link";

export const metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return <main className="min-h-screen px-6 py-12"><article className="panel mx-auto max-w-3xl">
    <Link href="/" className="font-extrabold text-brand">← Aggenda</Link>
    <h1 className="mt-8 text-4xl font-extrabold">Termos de Uso</h1>
    <p className="mt-2 text-sm text-muted">Versão de 22/10/2026</p>
    <div className="mt-8 grid gap-6 leading-7 text-muted">
      <p>O Aggenda fornece agenda, cadastros e automações de atendimento. A empresa contratante responde pelos dados cadastrados, permissões da equipe e mensagens enviadas.</p>
      <p>A contratação é processada pelo Asaas. O mensal por cartão tem renovação mensal; Pix e períodos semestrais ou anuais são antecipados e sem renovação automática. Preço total, recursos, profissionais e franquias são apresentados antes do pagamento. O cancelamento da renovação preserva o período já pago e não apaga automaticamente os dados.</p>
      <p>O teste gratuito dura 30 dias, sem cartão e sem cobrança automática, com até três profissionais, 1.000 respostas do agente, 30 documentos enviados para assinatura e dez notas nacionais autorizadas após habilitação fiscal. Comprar durante o teste inicia o período pago informado no checkout, sem acrescentar os dias gratuitos restantes.</p>
      <p>Convites especiais podem oferecer o Aggenda Completo por R$ 5,00 em pagamento único por um ano, sem renovação automática, com até três profissionais e franquias mensais de 1.000 respostas, 30 documentos enviados e dez notas nacionais autorizadas após habilitação. Ferramentas futuras ficam disponíveis conforme lançamento e habilitação durante a vigência do piloto.</p>
      <p>As franquias não acumulam. Novas operações são interrompidas quando o saldo acaba; documentos já enviados podem ser concluídos e os registros permanecem acessíveis durante a vigência do acesso. Pacotes adicionais dependem de compra antecipada confirmada e valem até o fim da franquia vigente. Tarifas Meta e serviços externos são separadas. Lembretes proativos e campanhas precisam de saldo próprio e não estão incluídos na franquia de respostas. O processamento por IA tem limites técnicos e de consumo; situações acima desses limites podem ser encaminhadas ao atendimento humano.</p>
      <p>Nesta fase inicial, implantação, ativação, importação e exportação de dados são gratuitas, inclusive implantação assistida e configuração fiscal assistida. Certificados, tributos e provedores fiscais externos são de responsabilidade do contratante.</p>
      <p>Manutenções e serviços externos podem causar interrupções. O contratante deve proteger suas credenciais e comunicar acessos indevidos.</p>
      <p>É proibido usar o serviço para fraude, spam, conteúdo ilícito ou tratamento de dados sem base legal. Violações podem resultar em suspensão.</p>
      <p>Dúvidas, cancelamentos e solicitações devem ser encaminhados pelos canais de suporte informados no aplicativo.</p>
    </div>
  </article></main>;
}
