// Commercial display only. Never use this catalog to determine checkout charges.
export const landingNav = [
  ["Início", "inicio"],
  ["Funcionalidades", "funcionalidades"],
  ["Para quem é", "para-quem"],
  ["Como funciona", "como-funciona"],
  ["Planos", "planos"],
  ["Perguntas frequentes", "perguntas"],
] as const;

export const landingOffer = {
  signupUrl: "/entrar?callbackURL=%2Fonboarding%3Fnext%3D%252Fassinatura",
  loginUrl: "/entrar",
  contactEmail: "contato@aggenda.app.br",
  trialDays: 30,
  monthlyInCents: 4990,
  annualMonthlyInCents: 3990,
  annualTotalInCents: 47880,
  checkoutInPilot: true,
} as const;

export const landingFeatures = [
  [
    "Agenda inteligente",
    "Horários, disponibilidade, bloqueios e reagendamentos. Sua rotina ganha clareza.",
  ],
  [
    "Agendamento online",
    "Uma página do seu negócio para o cliente escolher serviço, profissional e horário.",
  ],
  [
    "Gestão de clientes",
    "Cadastros, contatos e histórico reunidos para continuar cada atendimento de onde parou.",
  ],
  [
    "Financeiro e caixa",
    "Receitas, despesas, vendas e recebimentos. Acompanhe o movimento do seu negócio.",
  ],
  [
    "Pacotes e sessões",
    "Saiba quais sessões foram utilizadas e quais ainda estão disponíveis para cada cliente.",
  ],
  [
    "Estoque e produtos",
    "Organize vendas, consumo interno, entradas e saídas, com lotes e validade quando aplicável.",
  ],
  [
    "Equipe e comissões",
    "Defina regras, confira valores e registre quitações com um histórico organizado.",
  ],
  [
    "CRM e relacionamento",
    "Acompanhe oportunidades, propostas, campanhas e o momento de convidar o cliente a voltar.",
  ],
  [
    "Anamnese e documentos",
    "Fichas digitais, modelos personalizados e PDFs conectados ao histórico do atendimento.",
  ],
  [
    "Fotografias e evolução",
    "Organize imagens por sessão e compare antes e depois com contexto e acesso controlado.",
  ],
  [
    "WhatsApp e automações",
    "Do atendimento assistido aos agentes de IA, conforme contratação e configuração do canal.",
  ],
  [
    "Relatórios e indicadores",
    "Uma visão dos dados operacionais, comerciais e financeiros para apoiar suas decisões.",
  ],
] as const;

export const landingSegments = [
  {
    name: "Clínicas de estética",
    short: "Estética",
    image: "estetica",
    description: "Do primeiro contato ao acompanhamento de cada sessão.",
    benefits: [
      "Anamneses e termos",
      "Fotos de antes e depois",
      "Pacotes, materiais e retornos",
    ],
    detail:
      "Organize avaliações, procedimentos faciais e corporais, documentos e histórico. Configure serviços e profissionais de acordo com as habilitações da sua equipe.",
  },
  {
    name: "Esteticistas autônomos",
    short: "Autônomos",
    image: "autonomos",
    description: "Sua operação organizada, mesmo quando a equipe é você.",
    benefits: [
      "Agenda e página de reservas",
      "Clientes e recebimentos",
      "Produtos e sessões",
    ],
    detail:
      "Comece com uma agenda profissional e concentre cadastros, serviços e financeiro. Amplie a equipe e contrate adicionais quando precisar.",
  },
  {
    name: "Salões de beleza",
    short: "Salões",
    image: "salao",
    description: "Mais sintonia entre agenda, profissionais e caixa.",
    benefits: ["Agenda da equipe", "Comissões por serviço", "Vendas e estoque"],
    detail:
      "Cadastre cortes, colorações e tratamentos por categoria. Configure duração, disponibilidade e comissões, acompanhando produtos vendidos e materiais consumidos.",
  },
  {
    name: "Barbearias",
    short: "Barbearias",
    image: "barbearia",
    description: "Horários no lugar. Equipe e clientes mais próximos.",
    benefits: [
      "Reservas online",
      "Serviços e combinações",
      "Comissões e retornos",
    ],
    detail:
      "Organize corte, barba e combinações de serviços, distribua horários entre barbeiros e acompanhe vendas, recebimentos e clientes que podem retornar.",
  },
  {
    name: "Esmalterias e estúdios",
    short: "Estúdios",
    image: "estudio",
    description: "Cuidado com os detalhes, inclusive na gestão.",
    benefits: [
      "Serviços por categoria",
      "Agenda por profissional",
      "Histórico e manutenção",
    ],
    detail:
      "Adapte o catálogo para unhas, sobrancelhas, cílios, maquiagem ou micropigmentação. Configure fichas, documentos e prazos de manutenção para sua atividade.",
  },
  {
    name: "Spas, massoterapia e depilação",
    short: "Bem-estar",
    image: "spa",
    description: "Uma rotina mais tranquila para quem oferece bem-estar.",
    benefits: [
      "Salas e disponibilidade",
      "Pacotes de sessões",
      "Histórico e financeiro",
    ],
    detail:
      "Organize atendimentos individuais, uso de salas e pacotes. Mantenha orientações, histórico e controle financeiro conectados a cada cliente.",
  },
] as const;

export const landingFaqs = [
  [
    "O que é o Aggenda?",
    "É uma plataforma de gestão que conecta agenda, clientes, equipe, vendas, pacotes, estoque, financeiro e relacionamento em um só lugar.",
  ],
  [
    "Para quais negócios o Aggenda é indicado?",
    "Para clínicas de estética, esteticistas, salões, barbearias, esmalterias e negócios de beleza e bem-estar com atendimentos agendados. Serviços e documentos devem ser configurados conforme sua atividade.",
  ],
  [
    "Quanto custa o Aggenda?",
    "A oferta comercial do app para um profissional é de R$ 49,90 no mensal ou R$ 478,80 por ano, equivalente a R$ 39,90/mês. Profissionais extras e módulos são adicionais. A contratação está em fase piloto: confira as condições e o valor efetivamente apresentados no checkout antes de pagar.",
  ],
  [
    "Posso usar no celular?",
    "Sim. O Aggenda pode ser acessado pelo navegador no celular, tablet ou computador, com conexão à internet.",
  ],
  [
    "O Aggenda possui agendamento online?",
    "Sim. Você pode habilitar uma página personalizada para seus clientes escolherem serviço, profissional e horário, respeitando a disponibilidade e as regras configuradas.",
  ],
  [
    "Posso gerenciar vários profissionais?",
    "Sim. Cadastre a equipe e organize agendas e permissões. A oferta de entrada contempla um profissional; profissionais adicionais são contratados separadamente.",
  ],
  [
    "Posso controlar pacotes e sessões?",
    "Sim. O Aggenda permite cadastrar pacotes e acompanhar aquisição, validade, sessões disponíveis e utilizadas no atendimento.",
  ],
  [
    "O sistema possui controle financeiro?",
    "Sim. Você pode acompanhar receitas, despesas, vendas, recebimentos, comissões e fechamento de caixa, conforme os acessos da sua equipe.",
  ],
  [
    "O Aggenda oferece WhatsApp e inteligência artificial?",
    "Sim, como modalidades adicionais. Há atendimento assistido, notificações e agentes que informam ou operam a agenda. O funcionamento depende do plano, canal ativo, integração, configuração e franquias; tarifas externas podem se aplicar.",
  ],
  [
    "Posso importar meus clientes?",
    "Há recursos de importação e exportação. Confira os formatos e campos aceitos na área de dados e revise as informações antes de importar. A migração de qualquer sistema não é automática.",
  ],
  [
    "Como funcionam as integrações de pagamento?",
    "Dependem da conta da empresa no provedor, credenciais, configuração e validação dos fluxos. As tarifas e condições são as do provedor contratado. A assinatura do Aggenda é separada dos pagamentos recebidos dos seus clientes.",
  ],
  [
    "Como contratar um plano?",
    "Clique em Começar agora, acesse ou crie sua conta e configure seu negócio. O fluxo segue para a área de assinatura. Durante o piloto, confira o valor e as condições exibidos antes de concluir qualquer pagamento.",
  ],
] as const;

export const landingPlans = [
  {
    name: "Essencial",
    subtitle: "Seu negócio começa bem organizado.",
    monthly: landingOffer.monthlyInCents,
    annual: landingOffer.annualTotalInCents,
    tag: "APP PARA 1 PROFISSIONAL",
    features: [
      "Agenda e agendamento online",
      "Clientes e histórico",
      "Vendas, pacotes e estoque",
      "Financeiro e comissões",
    ],
    note: "Amplie a equipe com profissionais adicionais.",
  },
  {
    name: "Profissional",
    subtitle: "Sua gestão com atendimento mais próximo.",
    monthly: landingOffer.monthlyInCents + 9990,
    annual: landingOffer.annualTotalInCents + 95904,
    tag: "APP + AGGENDA ATENDIMENTO",
    features: [
      "Tudo da composição Essencial",
      "Atendimento e informações no WhatsApp",
      "Catálogo de serviços e produtos",
      "Link para agendar no portal",
    ],
    note: "Inclui o Aggenda Atendimento, contratado como adicional.",
  },
  {
    name: "Completo",
    subtitle: "Mais autonomia para sua operação.",
    monthly: landingOffer.monthlyInCents + 19990,
    annual: landingOffer.annualTotalInCents + 191904,
    tag: "APP + AGGENDA SECRETÁRIA",
    features: [
      "Tudo da composição Essencial",
      "Recursos do Aggenda Atendimento",
      "Consulta e reserva de horários na conversa",
      "Reagendamento e cancelamento controlados",
    ],
    note: "O Aggenda Secretária inclui as funções do Atendimento; você não paga pelos dois.",
  },
] as const;
