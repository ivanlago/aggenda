export type ConnectionGuide = {
  name: string;
  tabId: string;
  mode: "connection" | "reconciliation";
  intro: string;
  links: Array<{ label: string; href: string }>;
  steps: Array<{ title: string; text: string; webhook?: boolean }>;
  troubleshooting: string[];
};

const reconciliationGuide = (name: string, slug: string): ConnectionGuide => ({
  name, tabId: `reconciliation-${slug}`, mode: "reconciliation",
  intro: `Acompanhe no Aggenda os recebimentos de ${name} por conciliação de extrato. Esta modalidade não conecta a maquininha, não pede token e não emite cobranças nessa instituição.`,
  links: ({
    "stone-ton": [{ label: "Acessar conta Stone", href: "https://conta.stone.com.br/" }, { label: "Site e ajuda Ton", href: "https://www.ton.com.br/" }],
    cielo: [{ label: "Minha Conta Cielo", href: "https://www.cielo.com.br/minha-conta-cielo/" }],
    rede: [{ label: "Site oficial e acesso ao portal Rede", href: "https://www.userede.com.br/" }],
    getnet: [{ label: "Ajuda Getnet: consultar vendas", href: "https://site.getnet.com.br/get-ajuda-configuracoes/como-consultar-minhas-vendas/" }],
    infinitepay: [{ label: "Ajuda InfinitePay: acompanhar depósitos", href: "https://ajuda.infinitepay.io/pt-BR/articles/6914071-como-acompanho-meus-depositos-pelo-navegador" }],
  } as Record<string, Array<{ label: string; href: string }>>)[slug] ?? [],
  steps: [
    { title: "Identifique a conta que recebe os depósitos", text: `Confira no seu contrato ou aplicativo de ${name} em qual conta bancária os valores das vendas são depositados. É o extrato dessa conta que você utilizará.` },
    { title: "Baixe o extrato bancário em OFX", text: "No site ou aplicativo do banco que recebe os depósitos, abra Extrato, escolha o período e procure Exportar ou Baixar em formato OFX. Os nomes dos menus variam conforme o banco. Se OFX não estiver disponível, peça orientação ao banco; PDF e CSV não são aceitos neste importador." },
    { title: "Prepare a conta no Aggenda", text: "Em Financeiro → Contas e fluxo de caixa → Configurar contas, categorias e centros de custo, cadastre a conta financeira que representa o banco recebedor. Confira os lançamentos a receber que serão vinculados aos créditos." },
    { title: "Importe o arquivo", text: "Abra Financeiro → Conciliação OFX, escolha a Conta de destino, selecione o arquivo .ofx de até 5 MB e clique em Importar OFX. Use o extrato bancário; um relatório de vendas da maquininha pode ter outro formato." },
    { title: "Confira e vincule os créditos", text: "Em Movimentos pendentes, confira data, descrição e valor. Escolha o lançamento correspondente em Vincular ao lançamento e clique em Conciliar. O seletor apresenta lançamentos pendentes com valor compatível. Não vincule apenas por coincidência de valor." },
    { title: "Verifique o resultado", text: "O movimento conciliado sai da lista de pendentes. A conciliação atual registra o vínculo com o lançamento; ela não dá baixa automática na conta a receber. Confira a situação em Contas e fluxo de caixa e, quando necessário, registre o recebimento após validar o crédito." },
  ],
  troubleshooting: [
    "Se o crédito vier líquido de taxas ou reunir várias vendas, ele pode não corresponder ao valor de um único lançamento. Confira o detalhamento da instituição e os registros de taxas antes de conciliar; não altere valores apenas para forçar o vínculo.",
    "Se o lançamento não aparecer, confira se está pendente e se o valor corresponde ao crédito. A lista mostra até 100 lançamentos pendentes e até 30 movimentos por vez.",
    "O Aggenda não recebe avisos automáticos dessa instituição nesta modalidade. Importe novos extratos conforme a sua rotina. A disponibilidade de OFX depende do banco recebedor.",
  ],
});

export const paymentConnectionGuides: Record<string, ConnectionGuide> = {
  "mercado-pago": {
    name: "Mercado Pago", tabId: "mercado-pago", mode: "connection",
    intro: "Conecte a conta que receberá o dinheiro dos seus clientes. O Aggenda usa Checkout Pro com API de Preferences e recebe a confirmação dos pagamentos por webhook, um aviso automático enviado pelo Mercado Pago.",
    links: [
      { label: "Abrir painel de integrações do Mercado Pago", href: "https://www.mercadopago.com.br/developers/panel" },
      { label: "Documentação: criar aplicação", href: "https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/create-application" },
      { label: "Documentação: credenciais", href: "https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials" },
      { label: "Documentação: notificações de pagamento", href: "https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications" },
    ],
    steps: [
      { title: "Abra o painel e entre na conta recebedora", text: "Use o link do painel no início deste guia e entre com a conta Mercado Pago da empresa que receberá os pagamentos. Em Suas integrações, clique em Criar aplicação. Se já criou uma aplicação para o Aggenda, abra essa aplicação." },
      { title: "Crie a aplicação com as opções corretas", text: "Selecione Checkout Pro e API de Preferences. Dê um nome fácil de identificar, como Aggenda — Minha empresa. Pode usar o nome real da empresa; não precisa copiar o nome de uma clínica de demonstração. Leia a declaração de privacidade e os termos e, se concordar, aceite e clique em Criar aplicação." },
      { title: "Copie o Access Token", text: "Na aplicação, abra Produção → Credenciais de produção. Se necessário, conclua a ativação solicitada pelo Mercado Pago. Copie o Access Token, que é a chave privada usada para criar cobranças. Não copie Public Key, Client ID ou Client Secret para esse campo." },
      { title: "Configure as notificações de pagamento", text: "Na mesma aplicação, abra Webhooks → Configurar notificações e selecione Modo produtivo. Cole a URL da sua empresa mostrada abaixo. Marque Pagamentos (legacy), correspondente à API de Preferences, e clique em Salvar configuração. Se o painel apresentar apenas Pagamentos, confira que se trata do evento payment dessa integração.", webhook: true },
      { title: "Copie a assinatura secreta", text: "Após salvar, revele e copie a assinatura secreta gerada na seção Webhooks. Ela é diferente do Access Token e permite ao Aggenda conferir a origem dos avisos de pagamento." },
      { title: "Conecte no Aggenda", text: "Volte a Configurações → Provedores de pagamento → Mercado Pago. Selecione Produção, cole o Access Token e a Assinatura secreta do Webhook nos respectivos campos e clique em Conectar e validar. Confira a conta identificada e use Testar conexão atual. Os campos de chaves ficam vazios por segurança após salvar; isso não significa que foram apagadas." },
      { title: "Teste a cobrança e a confirmação automática", text: "Siga o teste de ponta a ponta abaixo. Se o botão Gerar código do Pix ficar desabilitado com a conta vendedora conectada, copie o link original da cobrança e abra em janela anônima (Ctrl + Shift + N no Chrome) ou em outro navegador, sem a sessão da conta vendedora. Confira os dados do pagador. Se o bloqueio continuar, verifique as mensagens do Mercado Pago." },
    ],
    troubleshooting: [
      "Testar conexão atual valida o acesso à conta. Webhook configurado indica que a assinatura foi cadastrada; a confirmação automática só é comprovada quando o pagamento chega ao Aggenda.",
      "O ambiente exibido junto ao nome da conta representa a conexão salva. Alterar apenas o seletor do formulário não muda a conexão; o novo ambiente e suas credenciais só são gravados ao conectar novamente.",
      "Se o Mercado Pago aprovar e o Aggenda continuar Pendente, confira a URL completa, o evento Pagamentos (legacy) e a assinatura da mesma aplicação. Consulte os registros de envio na seção Webhooks e peça ajuda com a mensagem de erro, sem enviar chaves. Não dê baixa manual durante esse diagnóstico.",
    ],
  },
  asaas: {
    name: "Asaas", tabId: "asaas", mode: "connection",
    intro: "Conecte a conta Asaas da sua empresa com uma chave de API. O Aggenda valida o acesso e tenta configurar automaticamente os avisos de pagamento.",
    links: [
      { label: "Abrir conta Asaas", href: "https://www.asaas.com/" },
      { label: "Documentação: gerar e gerenciar chaves", href: "https://docs.asaas.com/docs/chaves-de-api" },
    ],
    steps: [
      { title: "Entre pelo navegador como administrador", text: "Acesse o Asaas com a conta recebedora. A chave é criada na interface web, por um usuário administrador; essa criação não é feita pelo aplicativo." },
      { title: "Crie uma chave exclusiva", text: "Abra Integrações → Chaves de API e gere uma nova chave. Identifique-a como Aggenda. Copie imediatamente: o Asaas mostra a chave apenas uma vez. Se houver validade, acompanhe a expiração para manter a conexão funcionando." },
      { title: "Escolha o mesmo ambiente nos dois sistemas", text: "Produção usa a conta e dinheiro reais; Testes usa Sandbox e uma chave própria desse ambiente. As chaves são diferentes. Não use uma chave de produção com Testes selecionado." },
      { title: "Conecte e configure no Aggenda", text: "Em Configurações → Provedores de pagamento → Asaas, selecione o ambiente, cole a chave em Chave API da conta Asaas e clique em Conectar, validar e configurar. O Aggenda cadastra o webhook automaticamente; não é necessário inventar uma senha para o aviso." },
      { title: "Confira o resultado", text: "Confira a conta, o ambiente e o estado do webhook. Use Testar conexão atual. Se houver aviso de webhook com erro, resolva a configuração antes de depender da baixa automática." },
      { title: "Faça um teste completo", text: "Use uma conta a receber pendente e execute o teste abaixo. Comece por um meio de pagamento e confira aprovação e recebimento automático; cartão, boleto, parcelamento e recorrência precisam de validações próprias." },
    ],
    troubleshooting: [
      "Se a chave for recusada, confira ambiente, cópia completa, validade e se ela continua habilitada em Integrações → Chaves de API.",
      "Conexão validada não confirma sozinha a entrega dos avisos. Se o pagamento não mudar no Aggenda, confira o estado e os registros do webhook no Asaas antes de registrar baixa manual.",
    ],
  },
  pagbank: {
    name: "PagBank", tabId: "pagbank", mode: "connection",
    intro: "Conecte o token da conta PagBank da empresa para emitir links de checkout. O Aggenda informa o endereço de notificação ao criar cada checkout.",
    links: [
      { label: "Abrir conta PagBank", href: "https://acesso.pagseguro.uol.com.br/" },
      { label: "Documentação: obter o token", href: "https://developer.pagbank.com.br/docs/token-de-autenticacao" },
      { label: "Portal do desenvolvedor (Sandbox)", href: "https://portaldev.pagbank.com.br/" },
    ],
    steps: [
      { title: "Entre na conta da empresa pelo computador", text: "Para Produção, acesse sua conta PagBank no navegador. Abra Vendas → Integrações e clique em Gerar Token." },
      { title: "Se for simular, obtenha o token de Sandbox", text: "No Portal do Desenvolvedor PagBank, entre na conta e abra Tokens. Esse token é usado com Testes no Aggenda. O token de produção não deve ser usado como credencial de Sandbox." },
      { title: "Confira a liberação da sua integração", text: "Ter um token de produção não libera automaticamente todas as APIs. Confira com o PagBank se o Checkout usado pela sua conta exige homologação ou habilitação. A validação do token no Aggenda não substitui essa liberação." },
      { title: "Conecte no Aggenda", text: "Em Configurações → Provedores de pagamento → PagBank, selecione Produção ou Testes conforme o token, cole em Token PagBank e clique em Conectar e validar. Depois use Testar conexão atual." },
      { title: "Confira os avisos de pagamento", text: "Ao gerar a cobrança, o Aggenda inclui os endereços de aviso no checkout PagBank. Não há campo de assinatura secreta para preencher nessa aba. Confira a aprovação automática pelo teste abaixo." },
      { title: "Teste cada modalidade que pretende usar", text: "Comece com uma cobrança única. Confirme o checkout, o pagamento e a baixa automática antes de usar com clientes. Parcelamento, recorrência, cancelamento e estorno devem ser verificados separadamente e dependem da habilitação da conta." },
    ],
    troubleshooting: [
      "Se o token validar, mas a emissão falhar, confira a mensagem retornada e a habilitação da API Checkout com o PagBank.",
      "Se o pagamento for aprovado e não chegar ao Aggenda, guarde a identificação da cobrança e consulte os avisos do PagBank. Não compartilhe o token e não marque como recebido durante o diagnóstico.",
    ],
  },
  efi: {
    name: "Efí Bank", tabId: "efi", mode: "connection",
    intro: "A conexão atual do Aggenda com a Efí emite cobranças Pix. Você precisa das credenciais da aplicação, de uma chave Pix da conta e do certificado da API.",
    links: [{ label: "Acessar conta Efí", href: "https://app.sejaefi.com.br/" }, { label: "Documentação: credenciais e certificado Efí", href: "https://dev.efipay.com.br/docs/api-pix/credenciais/" }],
    steps: [
      { title: "Crie uma aplicação na conta Efí", text: "No painel da sua conta Efí, abra API / Aplicações e crie uma aplicação chamada Aggenda. Selecione API Pix e o ambiente desejado." },
      { title: "Habilite as permissões necessárias", text: "Nos escopos da API Pix, habilite cob.read, cob.write, pix.read, webhook.write e payloadlocation.read para consultar e criar cobranças, consultar recebimentos, cadastrar avisos e obter o QR Code. Os nomes técnicos são os exibidos pela Efí; não é necessário liberar envio de Pix para terceiros." },
      { title: "Obtenha credenciais e certificado", text: "Copie Client ID e Client Secret do ambiente escolhido. Na área de certificados da API Efí, gere e baixe o certificado .p12 desse ambiente. Use o certificado da API, não o certificado fiscal A1 da empresa. Se houver senha, tenha-a em mãos." },
      { title: "Confira a chave Pix", text: "Use uma chave Pix cadastrada na mesma conta Efí recebedora. O certificado e as credenciais também precisam corresponder a essa conta e ao ambiente selecionado." },
      { title: "Preencha a conexão no Aggenda", text: "Em Configurações → Provedores de pagamento → Efí Bank, selecione Produção ou Homologação. Preencha Chave Pix, Client ID e Client Secret, selecione o arquivo .p12 (até 128 KB) e informe a senha, se houver. Clique em Conectar, validar e configurar." },
      { title: "Confira webhook e teste o Pix", text: "O Aggenda valida credenciais e certificado e tenta cadastrar o webhook automaticamente. Se houver erro, resolva-o antes de depender do recebimento automático. Use Testar conexão atual e execute o teste Pix abaixo." },
    ],
    troubleshooting: [
      "Se a autenticação falhar, confira os dois campos de credenciais, o ambiente, o certificado da API e sua senha.",
      "Se o cadastro do webhook falhar, confira o escopo webhook.write e guarde a mensagem para diagnóstico. Não envie o certificado nem suas chaves por mensagem.",
      "Cartão e boleto não fazem parte desta conexão Efí no Aggenda; a disponibilidade desses produtos na instituição não significa que estejam integrados aqui.",
    ],
  },
  "stone-ton": reconciliationGuide("Stone/Ton", "stone-ton"),
  cielo: reconciliationGuide("Cielo", "cielo"),
  rede: reconciliationGuide("Rede", "rede"),
  getnet: reconciliationGuide("Getnet", "getnet"),
  infinitepay: reconciliationGuide("InfinitePay", "infinitepay"),
};
