import Link from "next/link";

export const metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return <main className="min-h-screen px-6 py-12"><article className="panel mx-auto max-w-3xl">
    <Link href="/" className="font-extrabold text-brand">← Aggenda</Link>
    <h1 className="mt-8 text-4xl font-extrabold">Política de Privacidade</h1>
    <p className="mt-2 text-sm text-muted">Versão de 01/09/2026</p>
    <div className="mt-8 grid gap-6 leading-7 text-muted">
      <p>Tratamos dados de conta, empresa, equipe, clientes, agenda, cobrança e registros técnicos para prestar, proteger e melhorar o Aggenda.</p>
      <p>A contratante controla os dados de seus clientes; o Aggenda os opera para executar o serviço. Fornecedores essenciais de hospedagem, banco de dados, pagamentos, mensagens e IA podem participar do processamento.</p>
      <p>Aplicamos segregação entre empresas, controle de acesso e auditoria. Conservamos dados pelo período necessário ao serviço e às obrigações legais.</p>
      <p>Titulares podem solicitar confirmação, acesso, correção, portabilidade ou exclusão, observadas as obrigações legais e a relação com a empresa responsável pelo cadastro.</p>
      <p>Solicitações de privacidade e comunicações de incidentes devem ser enviadas pelos canais de suporte do Aggenda.</p>
      <section className="grid gap-3">
        <h2 className="text-xl font-extrabold text-foreground">Integração com Google Agenda</h2>
        <p>Quando um usuário conecta voluntariamente sua conta Google a um profissional, o Aggenda acessa o endereço de e-mail da conta e recebe autorização para criar, consultar, atualizar e excluir eventos nos calendários pertencentes a esse usuário. A finalidade exclusiva é sincronizar agendamentos que o próprio usuário administra no Aggenda.</p>
        <p>Armazenamos o e-mail conectado, o identificador do calendário, os escopos autorizados e tokens OAuth criptografados. Não vendemos esses dados, não os utilizamos para publicidade e não os transferimos para treinamento de modelos de inteligência artificial.</p>
        <p>O acesso é compartilhado apenas com a infraestrutura indispensável à prestação e à segurança do serviço. O uso de informações recebidas das APIs do Google observa os requisitos de uso limitado da Política de Dados do Usuário dos Serviços de API do Google.</p>
        <p>O usuário pode remover a conexão em Profissionais → Google Agenda e também revogar o acesso na página de segurança da própria Conta Google. Após a desconexão, o Aggenda deixa de usar os tokens armazenados, ressalvados registros técnicos e cópias temporárias necessários à segurança e ao cumprimento de obrigações legais.</p>
      </section>
      <p>Contato para privacidade e suporte: <a className="font-bold text-brand underline" href="mailto:contato@aggenda.app.br">contato@aggenda.app.br</a>.</p>
    </div>
  </article></main>;
}
