# Planejamento dos produtos de chatbot da Aggenda

## 1. Decisão de produto

A Aggenda deve manter uma única plataforma multi-tenant e modular. `Chat`, `Flow`
e `Core` são conjuntos de capacidades habilitados por plano. `AI` é uma camada
adicional, nunca um sistema administrativo independente.

Catálogo comercial recomendado:

| Oferta | Capacidades | Cliente ideal |
| --- | --- | --- |
| Aggenda Chat | Atendimento determinístico, FAQ, menu, lead e handoff | Pequenas empresas que querem organizar o WhatsApp |
| Aggenda Chat + AI | Chat com linguagem natural e base de conhecimento, sem operações reais | Empresas com alto volume de perguntas |
| Aggenda Flow | Chat + automações e integrações externas | Empresas que já usam Calendar, Sheets ou CRM |
| Aggenda Flow + AI | Flow com interpretação de intenção e coleta inteligente | Operações integradas com conversas menos rígidas |
| Aggenda Core | Chat + agenda e cadastros nativos da Aggenda | Clínicas e prestadores que querem gestão completa |
| Aggenda Core + AI | Core operado em linguagem natural por ferramentas controladas | Oferta premium e evolução do protótipo atual |

O upgrade deve habilitar capacidades no mesmo tenant, sem migração de dados e sem
troca de número do WhatsApp.

## 2. Diagnóstico do projeto atual

### O que já existe

- Next.js App Router com PostgreSQL e Drizzle.
- Autenticação, organizações, membros e papéis `owner`, `admin` e `member`.
- Isolamento por `organizationId` nas principais entidades.
- Clientes, profissionais, especialidades, serviços e vínculos.
- Disponibilidade semanal, exceções, bloqueios e cálculo de horários.
- Agendamentos internos, confirmação, cancelamento, lembretes e auditoria básica.
- Página pública de agendamento.
- Assinatura e webhooks de cobrança via Stripe/Asaas.
- API autenticada para integração com n8n.
- Protótipo funcional de `Core + AI` em um workflow n8n com WhatsApp e Gemini.

### Lacunas críticas

- O WhatsApp e a IA estão orquestrados fora da aplicação e não são configuráveis
  por tenant.
- Não existem tabelas próprias para canais, contatos, conversas, mensagens,
  consentimento, bloqueio, handoff e status de entrega.
- O plano atual só distingue `trial` e `essential`; não há entitlements por produto.
- Não existe gateway central que valide plano, permissão, tenant, idempotência e
  confirmação antes de executar uma ferramenta.
- Não há catálogo versionado de prompts, menus, FAQs, ferramentas e fluxos.
- Não há medição de mensagens, tokens, custos de IA, execuções ou limites do plano.
- Não há painel de atendimento humano nem mecanismo formal de pausar/devolver a
  conversa ao bot.
- Não existem testes automatizados nem contratos versionados para os workflows.
- `Flow` ainda não possui engine, filas, retries, dead-letter ou conectores.
- A base de conhecimento e a busca semântica do módulo AI ainda não existem.

### Classificação do chatbot atual

O workflow atual não é um produto genérico: ele é um protótipo vertical de
`Aggenda Core + AI` para clínica estética. Ele consulta a base interna, interpreta
texto livre e cria agendamentos reais. Deve virar o primeiro template vertical,
mas não deve ser usado como arquitetura definitiva nem como modelo dos planos mais
simples.

## 3. Arquitetura-alvo

Manter inicialmente o monólito modular Next.js, evitando separar serviços antes
de existir necessidade operacional comprovada.

```text
src/
  modules/
    messaging/       canais, contatos, conversas, mensagens e status
    chat/            menus, palavras-chave, FAQ, leads e handoff
    flow/            definições, versões, execuções, retries e conectores
    core/            clientes, profissionais, serviços, agenda e pagamentos
    ai/              intenções, conhecimento, prompts, tools, uso e segurança
    integrations/    WhatsApp, Calendar, Sheets, CRM, e-mail e webhooks
    auth/            identidade, papéis, permissões e validações adicionais
    billing/         planos, entitlements, limites e medição
    audit/           trilha imutável e eventos de segurança
  app/api/
    webhooks/whatsapp/
    messaging/
    tools/
    integrations/
```

Adotar interfaces substituíveis:

- `MessagingProvider`: Meta WhatsApp inicialmente.
- `AIProvider`: Gemini inicialmente, sem acoplá-lo ao domínio.
- `CalendarProvider`: Google Calendar primeiro.
- `PaymentProvider`: Asaas/Stripe conforme operação.
- `WorkflowRunner`: n8n no primeiro ciclo; engine própria somente após validar o
  produto Flow.

### Fluxo único de mensagens

```text
Webhook -> validar assinatura -> deduplicar -> identificar tenant/canal/contato
        -> registrar mensagem -> verificar consentimento/bloqueio/horário
        -> carregar plano e estado da conversa
        -> rotear para Chat, Flow ou AI
        -> validar ação/tool e confirmação
        -> executar Core/integração
        -> registrar resultado e auditoria
        -> enviar resposta -> atualizar status de entrega
```

## 4. Entitlements e planos

Não codificar comportamento diretamente pelo nome comercial do plano. Criar
capacidades verificáveis, por exemplo:

```ts
type ProductFeature =
  | "chat.menus"
  | "chat.faq"
  | "chat.handoff"
  | "flow.external_calendar"
  | "flow.webhooks"
  | "core.native_scheduling"
  | "core.payments"
  | "ai.natural_language"
  | "ai.knowledge_base"
  | "ai.tool_calling";
```

Tabelas mínimas:

- `plans`, `plan_features` e `organization_feature_overrides`.
- `usage_counters` e `usage_events` para mensagens, execuções e tokens.
- Limites por canal, atendentes, contatos ativos, automações e uso de IA.
- Toda rota, job e ferramenta deve chamar uma única função
  `requireFeature(organizationId, feature)`.

## 5. Modelos comercializáveis

### 5.1 Aggenda Chat

MVP obrigatório:

- Conexão de um canal WhatsApp por tenant.
- Boas-vindas, fora do expediente e encerramento configuráveis.
- Menu numerado com submenus e estado determinístico.
- Palavras-chave e FAQ cadastrada.
- Informações institucionais e serviços informativos.
- Coleta de lead e solicitação de agendamento, sem confirmar horário real.
- Handoff com fila, motivo, setor, pausa e devolução ao bot.
- Consentimento, opt-out, bloqueio e histórico.
- Caixa de entrada básica e status das mensagens.

Não incluir agenda real, IA generativa ou integrações complexas.

Critério de lançamento: uma empresa não técnica consegue configurar o bot pelo
painel, conectar o WhatsApp, receber um lead e assumir/devolver uma conversa sem
editar workflow.

### 5.2 Aggenda Chat + AI

Adicionar:

- Classificação das intenções informativas.
- Extração de entidades sem execução operacional.
- Base de conhecimento aprovada por tenant.
- Resposta com fontes internas e fallback para menu/humano.
- Memória limitada à sessão, limiar de confiança e proteção de prompt.
- Medição de tokens, custo, latência, feedback e eventos de segurança.

Critério de lançamento: perguntas institucionais são respondidas somente com
conteúdo cadastrado; baixa confiança nunca gera informação inventada.

### 5.3 Aggenda Flow

MVP obrigatório:

- Fluxos versionados com gatilho, condição, ação e tratamento de erro.
- Execução assíncrona, idempotência, retries e dead-letter.
- Webhooks, tarefas agendadas e reprocessamento manual.
- Conectores iniciais: Google Calendar, Google Sheets, e-mail e webhook REST.
- Agendamento externo, lembretes e distribuição de leads.
- Cofre de credenciais e logs com dados sensíveis mascarados.
- Painel de execuções, erros e versões.

O n8n deve funcionar como executor inicial atrás de contratos da Aggenda. O
cliente não deve precisar acessar o editor do n8n. A Aggenda mantém templates
versionados e envia configurações validadas.

Critério de lançamento: falha externa nunca produz confirmação falsa; a execução
pode ser reprocessada com segurança sem duplicar evento, lead ou mensagem.

### 5.4 Aggenda Flow + AI

Adicionar linguagem natural apenas antes das automações autorizadas. A AI pode
selecionar um fluxo e coletar parâmetros, mas não criar etapas nem integrações por
conta própria.

Critério de lançamento: toda ação escolhida pela AI corresponde a um fluxo
publicado, tipado e permitido para o tenant.

### 5.5 Aggenda Core

O projeto atual cobre parte relevante deste produto. Completar:

- Unidades, salas/recursos e permissões mais granulares.
- Reserva temporária de horário e proteção contra concorrência.
- Remarcação, cancelamento e histórico completo da alteração.
- Confirmação de presença e políticas por tenant.
- Lista de espera com expiração de oferta.
- Pagamentos, links, PIX e confirmação somente por webhook.
- Validação adicional de identidade para consultas e ações sensíveis.
- Lembretes e notificações executados por worker/cron idempotente.
- Relatórios e auditoria de ações originadas no WhatsApp.

Critério de lançamento: criar, remarcar e cancelar via interfaces controladas
produz o mesmo resultado consistente no painel, na agenda e na auditoria.

### 5.6 Aggenda Core + AI

Transformar o workflow atual em um orquestrador de tools:

- `listServices`, `listProfessionals`, `getAvailableSlots`.
- `getAppointment`, `createAppointment`, `rescheduleAppointment`.
- `cancelAppointment`, `confirmAppointment`.
- `getPaymentStatus`, `createPaymentLink`.
- `requestHumanHandoff`.

Cada tool precisa de schema Zod, feature exigida, permissão, nível de risco,
confirmação, chave de idempotência, retorno estruturado e auditoria. A AI nunca
consulta tabelas diretamente.

Critério de lançamento: ações críticas só executam após confirmação vinculada a
um resumo e com prazo de validade; repetir a mesma mensagem não duplica a ação.

## 6. Plano de execução

### Fase 0 - Contratos e segurança (1 sprint)

- Congelar e documentar o comportamento do workflow atual.
- Definir eventos, estados de conversa, ferramentas e política de confirmação.
- Definir matriz de dados sensíveis e retenção LGPD.
- Criar testes de contrato para as APIs n8n existentes.
- Definir métricas: entrega, erro, handoff, conversão, custo e latência.

Saída: especificações aprovadas e baseline do protótipo sem regressão.

### Fase 1 - Plataforma comum de mensagens (2 sprints)

- Criar canais, contatos, conversas, mensagens, consentimentos e handoffs.
- Implementar webhook Meta validado, deduplicação e atualização de status.
- Criar outbox de envio, retry e logs estruturados.
- Criar inbox básica para atendimento humano.
- Isolar credenciais por tenant.

Saída: qualquer produto usa a mesma entrada, histórico e entrega de mensagens.

### Fase 2 - Billing e feature flags (1 sprint)

- Substituir a enumeração comercial rígida por planos e entitlements.
- Implementar `requireFeature` em API, jobs e ferramentas.
- Medir mensagens, contatos ativos, execuções e tokens.
- Adicionar overrides administrativos e trilha de auditoria.

Saída: upgrades habilitam recursos sem duplicar aplicação ou dados.

### Fase 3 - Produto Aggenda Chat (2 sprints)

- Implementar engine determinística, menus, FAQ, palavras-chave e horário.
- Criar painel de configuração e preview/teste.
- Implementar lead, solicitação de agendamento e handoff completo.
- Publicar primeiro template vertical: Clínica/Estética.

Saída: primeiro SKU vendável sem n8n ou IA para a lógica conversacional básica.

### Fase 4 - Productização do Core (2 sprints)

- Encapsular agenda e cadastros atuais no módulo Core.
- Adicionar reserva temporária, remarcação, cancelamento e confirmação.
- Criar APIs/tools internas idempotentes e auditadas.
- Integrar o Chat determinístico às operações do Core.

Saída: Aggenda Core vendável, mesmo sem IA.

### Fase 5 - AI como adicional (2 sprints)

- Criar provider abstrato, configuração por tenant e prompts versionados.
- Implementar intenções, entidades, confiança e memória de sessão.
- Criar tool gateway e política de confirmação.
- Implementar conhecimento aprovado e observabilidade de custo/qualidade.
- Migrar o workflow da Clínica Aura para o novo gateway.

Saída: Chat + AI e Core + AI vendáveis com segurança e métricas.

### Fase 6 - Produto Flow (3 sprints)

- Criar modelo de definição e versionamento de fluxos.
- Implementar executor n8n encapsulado, credenciais e eventos.
- Entregar conectores prioritários e jobs agendados.
- Criar logs, retries, dead-letter e reprocessamento.
- Publicar templates: agenda externa, lembretes e captação de leads.

Saída: Flow e Flow + AI vendáveis sem expor o n8n ao cliente.

### Fase 7 - Escala e governança (contínua)

- Testes de carga, filas, limites, alertas e dashboards operacionais.
- Revisão LGPD, retenção, exportação e exclusão de dados.
- Avaliação contínua de respostas AI e suíte contra regressões.
- Rotação de credenciais, resposta a incidentes e recuperação.

## 7. Presets recomendados de onboarding

Os produtos são horizontais e não levam o segmento no nome. Clínica, oficina ou
consultoria são apenas presets de configuração para acelerar o onboarding.

1. Saúde e cuidados: clínicas, consultórios, odontologia, psicologia e fisioterapia.
2. Estética e beleza: clínicas de estética, salões e barbearias.
3. Serviços com ativo: oficinas e assistências técnicas.
4. Serviços profissionais: consultorias e escritórios.
5. Atendimento informativo: escolas e comércio local.
6. Captação comercial: imobiliárias, energia solar e serviços B2B.

Cada template deve conter somente configuração versionada:

- textos e identidade;
- menus e FAQs;
- intenções permitidas;
- tools/fluxos habilitados;
- campos coletados;
- políticas e mensagens de fallback;
- testes de conversa esperados.

Não duplicar código por segmento.

## 8. Qualidade e critérios transversais

Antes de comercializar qualquer modelo:

- Isolamento entre tenants testado em todas as consultas e ferramentas.
- Webhooks e comandos idempotentes.
- Nenhuma confirmação sem resultado positivo persistido.
- Handoff humano sempre disponível.
- Consentimento, opt-out e bloqueio respeitados antes do envio.
- Segredos e dados pessoais mascarados nos logs.
- Ações críticas confirmadas e auditadas.
- Testes unitários, integração, contrato e conversas de ponta a ponta.
- Dashboard de falhas e alertas para mensagens não entregues.
- Limites e custo do plano mensuráveis.

## 9. Métricas para validar o negócio

- Taxa de entrega e tempo até primeira resposta.
- Percentual resolvido pelo bot e percentual encaminhado.
- Conversão de lead e de solicitação em agendamento.
- Agendamentos criados, remarcados e cancelados sem intervenção.
- Falhas por integração e sucesso após retry.
- Taxa de fallback/baixa confiança da AI.
- Custo de IA por conversa e por conversão.
- Tempo médio de atendimento humano após handoff.
- Churn, upgrade entre produtos e margem por plano.

## 10. Primeira entrega recomendada

Começar pela fundação de mensagens e entitlements, preservando o workflow atual
como piloto. Em seguida, lançar `Aggenda Chat` e productizar `Aggenda Core`. Só
então incorporar a AI como adicional controlado. Construir o `Flow` depois dos
contratos de mensagens e ferramentas evita transformar workflows n8n em regras de
negócio difíceis de versionar e testar.

O primeiro marco comercial deve ser:

1. Aggenda Chat horizontal, validado inicialmente com o preset Saúde e Cuidados.
2. Aggenda Core horizontal, validado com presets de Saúde e Serviços com Ativo.
3. Aggenda Core + AI usando a Clínica Aura como tenant piloto.
4. Aggenda Chat + AI.
5. Aggenda Flow e Flow + AI.
