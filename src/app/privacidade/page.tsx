import Link from "next/link";

export const metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return <main className="min-h-screen px-6 py-12"><article className="panel mx-auto max-w-3xl">
    <Link href="/" className="font-extrabold text-brand">← Aggenda</Link>
    <h1 className="mt-8 text-4xl font-extrabold">Política de Privacidade</h1>
    <p className="mt-2 text-sm text-muted">Versão de 04/08/2026</p>
    <div className="mt-8 grid gap-6 leading-7 text-muted">
      <p>Tratamos dados de conta, empresa, equipe, clientes, agenda, cobrança e registros técnicos para prestar, proteger e melhorar o Aggenda.</p>
      <p>A contratante controla os dados de seus clientes; o Aggenda os opera para executar o serviço. Fornecedores essenciais de hospedagem, banco de dados, pagamentos, mensagens e IA podem participar do processamento.</p>
      <p>Aplicamos segregação entre empresas, controle de acesso e auditoria. Conservamos dados pelo período necessário ao serviço e às obrigações legais.</p>
      <p>Titulares podem solicitar confirmação, acesso, correção, portabilidade ou exclusão, observadas as obrigações legais e a relação com a empresa responsável pelo cadastro.</p>
      <p>Solicitações de privacidade e comunicações de incidentes devem ser enviadas pelos canais de suporte do Aggenda.</p>
    </div>
  </article></main>;
}
