# Aggenda - Plano de execução da empresa e dos produtos

## 1. Direção estratégica

A Aggenda será posicionada como uma empresa de tecnologia para atendimento
digital, e não como uma agência que vende horas de desenvolvimento.

**Promessa central:** transformar contatos em clientes por meio de presença
digital, atendimento organizado e automação.

**Posicionamento recomendado:** `Tecnologia que transforma atendimento em clientes.`

**Estrutura da oferta:**

| Produto | Papel | Modelo |
| --- | --- | --- |
| Aggenda Start | Entrada e presença digital | Implantação padronizada |
| Aggenda Chat | Atendimento comercial no WhatsApp | Implantação + recorrência |
| Aggenda Flow | Automações e integrações | Implantação + recorrência |
| Aggenda Core | Sistema operacional do cliente | SaaS recorrente |
| Aggenda AI | Inteligência aplicada ao atendimento | Adicional recorrente + consumo |

Os cinco nomes devem existir comercialmente, mas não devem virar cinco
plataformas isoladas. Core, Chat, Flow e AI devem compartilhar a mesma conta,
organização, cobrança, permissões, dados, eventos e painel administrativo.

## 2. Ordem recomendada

### Onda 1 - Produto vendável

1. Consolidar o **Aggenda Core**, que já possui agenda, clientes, serviços,
   profissionais, equipe, isolamento por organização e cobrança.
2. Transformar a integração atual com n8n/WhatsApp em **Aggenda Chat**.
3. Criar um processo repetível de implantação e suporte.
4. Vender para três clientes-piloto do mesmo segmento.

### Onda 2 - Aquisição e automação

1. Empacotar landing pages como **Aggenda Start**.
2. Generalizar integrações como **Aggenda Flow**.
3. Criar bundles comerciais Core + Chat e Core + Chat + Flow.
4. Chegar a dez clientes pagantes antes de ampliar o escopo.

### Onda 3 - Inteligência e escala

1. Criar **Aggenda AI** sobre dados e fluxos já estabilizados.
2. Introduzir métricas de conversão e relatórios executivos.
3. Expandir para um segundo segmento somente depois de provar retenção no
   primeiro.

## 3. Plataforma comum

Antes de ampliar funcionalidades, a base compartilhada deve conter:

- organizações e isolamento de dados;
- usuários, papéis e permissões;
- catálogo de planos, módulos e limites;
- assinatura, cobrança, inadimplência e cancelamento;
- onboarding e checklist de implantação;
- trilha de auditoria e eventos de negócio;
- central de integrações e credenciais protegidas;
- notificações por e-mail e WhatsApp;
- painel interno de clientes, contratos e saúde da conta;
- métricas de uso, ativação e conversão;
- termos, política de privacidade e controles compatíveis com a LGPD.

Essa base evita duplicação quando Chat, Flow e AI forem adicionados ao Core.

## 4. Definição dos produtos

### 4.1 Aggenda Core

**Problema:** negócios de serviços controlam agenda e clientes de forma
fragmentada.

**Resultado vendido:** atendimento organizado, menos conflitos e visão diária
do negócio.

**MVP:**

- agenda diária, semanal e mensal;
- cadastro de clientes, serviços e profissionais;
- disponibilidade por profissional;
- equipe com permissões;
- confirmação e alteração de status;
- página pública de agendamento;
- histórico do cliente;
- painel com indicadores essenciais;
- assinatura e cobrança pelo Asaas.

**Próximos incrementos:**

- bloqueios, folgas e exceções de disponibilidade;
- recorrência de agendamentos;
- fila de espera;
- pacotes e créditos;
- caixa simples e contas a receber;
- relatórios de ocupação, cancelamento e receita prevista;
- exportação e portabilidade de dados.

**Critério para versão comercial:** uma empresa consegue cadastrar sua operação,
publicar horários, receber um agendamento, confirmá-lo e consultar o histórico
sem intervenção técnica.

### 4.2 Aggenda Chat

**Problema:** o WhatsApp comercial depende de respostas manuais e perde
oportunidades fora do horário.

**Resultado vendido:** atendimento inicial padronizado e agendamentos 24 horas
por dia.

**MVP:**

- saudação e identificação da empresa;
- menu de intenções;
- informações sobre serviços, preços, horários e localização;
- consulta de disponibilidade no Core;
- identificação ou criação do cliente;
- criação, consulta e cancelamento de agendamento;
- transferência para atendimento humano;
- registro da origem e do histórico da conversa;
- mensagens de fallback e indisponibilidade.

**Não incluir no primeiro MVP:** IA aberta respondendo qualquer tema, campanhas
em massa ou construtor visual completo de chatbot.

**Critério para versão comercial:** os dez principais cenários de atendimento
funcionam ponta a ponta, possuem fallback humano e geram registros auditáveis.

### 4.3 Aggenda Flow

**Problema:** informações precisam ser copiadas manualmente entre ferramentas.

**Resultado vendido:** processos executados automaticamente com rastreabilidade.

**MVP:**

- conectores para Aggenda, Google Calendar, Google Sheets, e-mail e webhook;
- confirmação e lembrete de agendamento;
- sincronização de agenda;
- aviso interno de novo cliente/agendamento;
- pesquisa pós-atendimento;
- log de execução e retentativa;
- alerta operacional em caso de falha.

Os fluxos devem nascer como modelos versionados. Customizações específicas
devem usar parâmetros, não cópias desconectadas por cliente.

**Critério para versão comercial:** cada modelo possui gatilho, entradas,
saídas, tratamento de erro, responsável e procedimento de recuperação.

### 4.4 Aggenda Start

**Problema:** pequenos negócios não têm uma presença digital que conduza o
visitante até o contato ou agendamento.

**Resultado vendido:** uma página profissional publicada rapidamente e
orientada à conversão.

**Escopo padronizado:**

- hero com proposta de valor;
- serviços e diferenciais;
- prova social;
- localização e horários;
- perguntas frequentes;
- contato pelo WhatsApp;
- agendamento pelo Core;
- analytics e eventos de conversão;
- domínio, SEO básico, privacidade e responsividade.

Devem existir poucos templates por segmento. O produto não deve se transformar
em desenvolvimento ilimitado sob demanda.

**Critério para versão comercial:** briefing, produção, revisão e publicação
cabem em um processo de até cinco dias úteis com no máximo duas rodadas de
ajustes.

### 4.5 Aggenda AI

**Problema:** regras fixas não cobrem perguntas variadas, elaboração de
orçamentos e priorização de oportunidades.

**Resultado vendido:** respostas mais naturais e ações assistidas, mantendo
controle e segurança.

**Primeiros casos de uso:**

- responder perguntas usando uma base aprovada;
- resumir conversas para o atendente;
- classificar intenção e urgência;
- sugerir resposta, sem envio automático inicialmente;
- coletar dados para orçamento;
- identificar leads sem resposta;
- gerar resumo diário de atendimento.

**Controles obrigatórios:**

- base de conhecimento por organização;
- registro de prompt, modelo, custo e resultado;
- limites de consumo por plano;
- proteção contra vazamento entre organizações;
- confirmação humana para ações sensíveis;
- fallback determinístico;
- avaliação de qualidade e taxa de erro.

**Critério para versão comercial:** cada caso de uso tem conjunto de testes,
limite de custo, resposta segura para incerteza e mecanismo de revisão humana.

## 5. Pacotes comerciais iniciais

Os valores abaixo são hipóteses para teste, não tabela definitiva.

| Oferta | Composição | Hipótese de preço |
| --- | --- | --- |
| Core Fundadores | Core para primeiros clientes | R$ 99/mês |
| Atendimento | Core + Chat | R$ 249/mês + implantação |
| Automação | Core + Chat + Flow básico | R$ 499/mês + implantação |
| Inteligência | Automação + AI | a partir de R$ 799/mês + consumo |
| Start | Landing page padronizada | R$ 990 a R$ 1.990 |

Regras:

- cobrar implantação quando houver configuração, importação ou automação;
- manter mensalidade separada de serviços pontuais;
- limitar usuários, unidades, conversas, fluxos e consumo de IA por plano;
- oferecer desconto anual somente após validar retenção e custo de suporte;
- registrar por escrito o que é padrão, adicional e fora de escopo.

## 6. Processo de criação de cada produto

Todo produto ou módulo deve atravessar o mesmo funil:

1. **Descoberta:** entrevistar ao menos cinco clientes do segmento e registrar
   frequência, impacto e solução atual do problema.
2. **Definição:** escrever público, problema, resultado, escopo, exclusões,
   métricas e preço hipotético.
3. **Protótipo:** validar fluxo e mensagem antes de construir a solução completa.
4. **MVP:** implementar apenas a jornada crítica com telemetria e suporte.
5. **Piloto:** operar com três clientes acompanhados de perto.
6. **Padronização:** transformar aprendizados em configuração, checklist e
   documentação.
7. **Lançamento:** liberar comercialmente com demonstração, contrato, suporte e
   métricas.
8. **Evolução:** priorizar por impacto em ativação, retenção, receita e custo
   operacional.

## 7. Roadmap de 90 dias

### Dias 1 a 15 - Fundamentos

- definir segmento inicial e perfil de cliente ideal;
- fechar posicionamento, slogan e arquitetura da marca;
- inventariar o que já existe no Core e no fluxo n8n;
- concluir Sandbox/produção do Asaas e webhooks;
- definir planos, módulos, limites e política de teste;
- criar backlog único por épicos;
- elaborar contrato, termos, privacidade e tratamento de dados;
- desenhar onboarding e suporte.

**Saída:** escopo comercial fechado e ambiente cobrando em Sandbox.

### Dias 16 a 30 - Core comercial

- concluir disponibilidade, página pública e fluxo completo do agendamento;
- aprimorar estados de assinatura e recuperação de inadimplência;
- criar painel interno de organizações e status;
- adicionar telemetria de ativação;
- preparar dados demonstrativos;
- testar segurança entre organizações;
- preparar roteiro de demonstração de 10 minutos.

**Saída:** Core pronto para três clientes-piloto.

### Dias 31 a 45 - Chat

- transformar o workflow atual em template configurável;
- implementar os dez cenários principais;
- criar transferência humana e registro do atendimento;
- adicionar observabilidade e alertas;
- criar tela de configuração da integração;
- homologar com número de teste.

**Saída:** Chat operando com Core em ambiente piloto.

### Dias 46 a 60 - Operação

- implantar os três pilotos;
- medir tempo até o primeiro valor;
- documentar dúvidas e falhas;
- criar base de conhecimento e SLA;
- estabelecer rotina de backup, incidentes e restauração;
- calcular custo real por cliente;
- revisar preço e limites.

**Saída:** entrega repetível sem depender de improvisação.

### Dias 61 a 75 - Comercial

- publicar landing institucional da Aggenda;
- criar páginas dos produtos e demonstração interativa;
- preparar apresentação, proposta e contrato;
- criar vídeo de 60 segundos;
- configurar CRM e etapas do funil;
- montar listas qualificadas via Google Maps e Instagram;
- iniciar prospecção controlada.

**Saída:** funil mensurável e materiais padronizados.

### Dias 76 a 90 - Conversão

- executar contatos e reuniões;
- fechar os primeiros clientes fora do círculo de pilotos;
- medir objeções, conversão e ciclo de venda;
- criar dois estudos de caso;
- decidir quais automações formarão o Flow básico;
- congelar novos recursos que não contribuam para ativação ou venda.

**Saída:** dez clientes como meta comercial e evidências para a próxima rodada.

## 8. Processo comercial

Funil recomendado:

`Lista qualificada -> contato -> vídeo curto -> demonstração -> diagnóstico de
20 minutos -> proposta -> fechamento -> onboarding -> ativação -> sucesso`

### Critérios das etapas

- **Lead qualificado:** negócio de serviços, usa WhatsApp, recebe agendamentos e
  demonstra problema operacional real.
- **Demonstração:** deve reproduzir o segmento do lead, não apresentar apenas
  telas genéricas.
- **Diagnóstico:** quantificar contatos, perdas, tempo gasto e ferramentas
  atuais.
- **Proposta:** vender resultado, prazo de implantação, mensalidade, limites e
  responsabilidades.
- **Fechamento:** contrato e primeira cobrança confirmados.
- **Ativação:** primeiro agendamento real concluído pelo fluxo.

## 9. Processo de implantação

1. Contrato e pagamento.
2. Formulário de dados da empresa.
3. Cadastro ou importação de equipe, serviços e horários.
4. Configuração de WhatsApp e integrações.
5. Personalização de mensagens e regras.
6. Testes conjuntos.
7. Treinamento rápido do responsável.
8. Entrada em operação.
9. Acompanhamento em 24 horas, 7 dias e 30 dias.

Cada etapa deve ter responsável, prazo, evidência e estado. O objetivo inicial é
ativar um cliente padrão em até dois dias úteis, excluindo dependências externas.

## 10. Suporte e operação

- canal oficial e horário de atendimento;
- classificação por dúvida, incidente e solicitação;
- SLA diferente por severidade;
- base de conhecimento reutilizável;
- status page e comunicação de incidentes;
- rotina de backup e teste de restauração;
- logs sem credenciais ou dados desnecessários;
- acompanhamento de webhooks, workflows e filas;
- processo formal para alterações fora do escopo.

Solicitações recorrentes devem virar configuração ou melhoria de produto.
Exceções de um único cliente devem ser cobradas e isoladas.

## 11. Indicadores

### Produto

- tempo até o primeiro agendamento;
- percentual de organizações ativadas;
- usuários ativos por semana;
- agendamentos criados e concluídos;
- taxa de cancelamento e ausência;
- atendimentos automatizados;
- falhas por fluxo.

### Comercial

- leads contatados;
- respostas;
- demonstrações;
- propostas;
- conversão por etapa;
- ciclo de venda;
- ticket de implantação e MRR contratado.

### Negócio

- MRR e crescimento;
- churn de clientes e receita;
- receita média por organização;
- margem bruta;
- custo de infraestrutura e IA por cliente;
- inadimplência;
- tempo de suporte por cliente;
- recuperação do custo de aquisição.

## 12. Gates de decisão

- Não iniciar AI antes de Chat e Core produzirem dados confiáveis.
- Não abrir um segundo segmento antes de obter dez clientes e três meses de
  retenção no primeiro.
- Não aceitar funcionalidade customizada sem avaliar reutilização e custo.
- Não escalar prospecção antes de onboarding e suporte serem repetíveis.
- Não liberar ação automática de IA que possa cobrar, cancelar, alterar agenda
  ou enviar informação sensível sem confirmação e auditoria.

## 13. Próximo backlog recomendado

1. Escolher o segmento inicial e entrevistar cinco empresas.
2. Fechar a matriz de planos, módulos e limites.
3. Regularizar e homologar o Asaas.
4. Concluir as lacunas do Core para ativação ponta a ponta.
5. Mapear os dez cenários do Chat.
6. Transformar o workflow n8n em template parametrizado.
7. Criar painel interno de clientes e implantação.
8. Criar telemetria e indicadores de ativação.
9. Produzir demo e dados fictícios por segmento.
10. Implantar três pilotos antes da landing institucional completa.

