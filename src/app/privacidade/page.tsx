import Link from "next/link";

export const metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return <main className="min-h-screen px-6 py-12"><article className="panel mx-auto max-w-3xl">
    <Link href="/" className="font-extrabold text-brand">← Aggenda</Link>
    <h1 className="mt-8 text-4xl font-extrabold">Política de Privacidade</h1>
    <p className="mt-2 text-sm text-muted">Atualizada em 12/11/2026</p>
    <div className="mt-8 grid gap-6 leading-7 text-muted">
      <p>Tratamos dados de conta, empresa, equipe, clientes, agenda, cobrança e registros técnicos para prestar, proteger e melhorar o Aggenda.</p>
      <p>A contratante controla os dados de seus clientes; o Aggenda os opera para executar o serviço. Fornecedores essenciais de hospedagem, banco de dados, pagamentos, mensagens e IA podem participar do processamento.</p>
      <p>Aplicamos segregação entre empresas, controle de acesso e auditoria. Conservamos dados pelo período necessário ao serviço e às obrigações legais.</p>
      <p>Titulares podem solicitar confirmação, acesso, correção, portabilidade ou exclusão, observadas as obrigações legais e a relação com a empresa responsável pelo cadastro.</p>
      <p>Solicitações de privacidade e comunicações de incidentes devem ser enviadas pelos canais de suporte do Aggenda.</p>
      <section id="google-agenda" className="grid gap-4 scroll-mt-6">
        <h2 className="text-xl font-extrabold text-foreground">Integração com Google Agenda</h2>
        <p>A conexão é opcional e depende de autorização na Conta Google. O Aggenda não solicita nem armazena a senha do Google. A autorização OAuth permite manter a sincronização mesmo quando o usuário não está com o Aggenda aberto.</p>
        <h3 className="font-bold text-foreground">Dados do Google acessados e armazenados</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>Endereço de e-mail da Conta Google conectada, usado para identificar e exibir qual conta está vinculada ao profissional (permissão userinfo.email).</li>
          <li>Autorização para gerenciar eventos em calendários pertencentes à conta (permissão calendar.events.owned). A integração atual utiliza o calendário principal e os eventos vinculados aos agendamentos do Aggenda; não importa a agenda pessoal completa.</li>
          <li>Identificadores do calendário e dos eventos sincronizados, permissões concedidas, validade da autorização, tokens de acesso e de renovação, além do estado e de eventuais erros de sincronização.</li>
        </ul>
        <h3 className="font-bold text-foreground">Finalidade e uso dos dados</h3>
        <p>Usamos esses dados para conectar a conta ao profissional, criar eventos para seus agendamentos, atualizar datas e horários, remover os eventos correspondentes quando um agendamento é cancelado e registrar o resultado da sincronização. Os identificadores retornados pelo Google permitem atualizar o evento correto, evitando duplicações.</p>
        <p>Para criar ou atualizar um evento, enviamos ao Google o serviço, o nome do cliente, a data, o horário e o fuso, o profissional e a empresa. O telefone e o e-mail do cliente, quando cadastrados, também integram a descrição do evento. A empresa deve considerar que esses dados ficarão sujeitos às configurações de compartilhamento do calendário no Google.</p>
        <h3 className="font-bold text-foreground">Compartilhamento, transferência e divulgação</h3>
        <p>Transmitimos ao Google os dados necessários à sincronização. Os dados da conexão são processados pela infraestrutura de hospedagem e banco de dados utilizada para operar o Aggenda. O e-mail conectado e o estado da conexão podem ser exibidos aos usuários da empresa autorizados a gerenciar a equipe. O acesso técnico deve se limitar às necessidades de operação, suporte e segurança. Dados podem ser divulgados quando houver obrigação legal aplicável.</p>
        <p>Não vendemos dados obtidos pelas APIs do Google, não os disponibilizamos a anunciantes, não os usamos para publicidade ou avaliação de crédito e não os transferimos para treinamento de modelos de inteligência artificial. A integração de calendário não envia os dados recebidos do Google aos provedores de IA do Aggenda.</p>
        <h3 className="font-bold text-foreground">Proteção dos dados</h3>
        <p>A comunicação com as APIs do Google utiliza HTTPS. Os tokens OAuth são criptografados no servidor com AES-256-GCM antes de serem armazenados no banco de dados. As chaves de criptografia ficam na configuração do servidor e não são enviadas ao navegador. Consultas e operações da conexão são vinculadas à empresa e ao profissional, com autenticação e controle de permissão para gerenciamento. O fluxo de autorização utiliza estado assinado com prazo de validade para verificar o retorno do Google.</p>
        <h3 className="font-bold text-foreground">Retenção, desconexão e exclusão</h3>
        <p>Mantemos os dados da conexão enquanto ela estiver ativa e forem necessários à sincronização. O usuário pode revogar a autorização na página de <a className="font-bold text-brand underline" href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">conexões da Conta Google</a>. Também pode solicitar a desconexão e a exclusão dos dados da integração ao suporte em <a className="font-bold text-brand underline" href="mailto:contato@aggenda.app.br">contato@aggenda.app.br</a>, informando a conta e a empresa para verificação da solicitação, sem enviar senhas ou tokens.</p>
        <p>A desconexão no Aggenda remove do banco ativo o vínculo, o e-mail e os tokens da integração. A revogação no Google impede novas operações que dependam daquela autorização. Agendamentos já registrados no Aggenda e eventos já criados no Google não são automaticamente apagados pela desconexão; sua exclusão é uma operação separada. Identificadores e registros técnicos podem permanecer associados ao histórico pelo período necessário à segurança, ao serviço e às obrigações legais. Cópias de segurança podem conservar registros temporariamente até sua substituição pelo ciclo de retenção aplicável.</p>
        <h3 className="font-bold text-foreground">Compromisso de uso limitado</h3>
        <p>O uso e a transferência, pelo Aggenda, de informações recebidas das APIs do Google obedecem à <a className="font-bold text-brand underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado (Limited Use). Qualquer nova finalidade ou ampliação de permissões deve ser informada antes de seu uso e, quando necessário, depender de nova autorização.</p>
      </section>
      <p>Contato para privacidade e suporte: <a className="font-bold text-brand underline" href="mailto:contato@aggenda.app.br">contato@aggenda.app.br</a>.</p>
    </div>
  </article></main>;
}
