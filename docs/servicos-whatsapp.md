# Aggenda — serviços de WhatsApp e automação

## Catálogo comercial

| Código | Produto | API oficial | IA | Papel |
| --- | --- | --- | --- | --- |
| `assisted` | WhatsApp Assistido | Não | Não | Mensagens prontas com envio manual pelo profissional. |
| `notify` | WhatsApp Notify | Sim | Não | Confirmações, lembretes e avisos transacionais. |
| `menu` | WhatsApp Menu | Sim | Não | Menu determinístico, informações e transferência humana. |
| `chat` | WhatsApp Chat | Sim | Não | FAQ e coleta estruturada de dados. |
| `chat_ai` | WhatsApp Chat + AI | Sim | Sim | Linguagem natural sobre base aprovada. |
| `core_ai` | WhatsApp Core + AI | Sim | Sim | Consulta e operação controlada da agenda. |

## Princípios de custo

- O Assistido não usa Cloud API, n8n ou modelo de IA.
- Notify, Menu e Chat devem resolver tarefas determinísticas sem tokens de IA.
- Chat + AI e Core + AI possuem franquias próprias de mensagens e chamadas de IA.
- Campanhas de marketing não fazem parte das franquias operacionais.
- Configuração ausente mantém o acesso legado durante a transição.
- Ao atingir a franquia mensal, a mensagem continua registrada, mas não é encaminhada automaticamente ao workflow.

## Roteamento do worker

O evento recebido inclui `whatsappServiceCode` e `workflowProduct`.

- `CORE_AI` é processado exclusivamente pelo agente transacional interno do Aggenda,
  autenticado por `AGGENDA_INTERNAL_API_URL` e `AGGENDA_INTERNAL_API_KEY`.
- O worker possui uma proteção explícita para impedir que `CORE_AI` seja enviado ao
  fallback ou a qualquer webhook do n8n.
- Produtos legados ainda não migrados podem continuar usando temporariamente
  `N8N_CHAT_WEBHOOK_URL`, `N8N_CHAT_AI_WEBHOOK_URL` e `N8N_CORE_WEBHOOK_URL`.
- `N8N_COMMERCIAL_WEBHOOK_URL` permanece reservado a automações comerciais publicadas.

## Estado da implementação

- Assistido: mensagens manuais contextuais para confirmação e cancelamento.
- Notify: confirmação, reagendamento, cancelamento e lembrete 24 horas antes via templates Meta e outbox com retentativa.
- Menu e Chat: workflow determinístico parametrizado, com menu, informações e handoff.
- Chat + AI: workflow com linguagem natural, base aprovada e handoff.
- Core + AI: agente interno com consulta, criação, reagendamento e cancelamento com
  confirmação, idempotência, auditoria e bloqueio contra horários duplicados.
- Métricas: entradas, saídas e chamadas de IA contabilizadas mensalmente; alertas de franquia visíveis no painel.

## Dependências para ativação comercial

1. Criar e aprovar na Meta quatro templates com quatro variáveis no corpo:
   `META_TEMPLATE_APPOINTMENT_CONFIRMATION`, `META_TEMPLATE_APPOINTMENT_RESCHEDULE`,
   `META_TEMPLATE_APPOINTMENT_CANCELLATION` e `META_TEMPLATE_APPOINTMENT_REMINDER`.
2. Manter o worker do Coolify ativo; os lembretes ficam agendados na Outbox e o worker faz uma varredura de recuperação a cada seis horas. O intervalo pode ser alterado por `OUTBOX_RECOVERY_INTERVAL_MS`.
3. Para Core + AI, configurar o agente interno no worker. Importar workflows no n8n
   somente para produtos legados ainda não migrados ou automações comerciais publicadas.
4. Executar os dez cenários em número Meta de teste antes de ativar cada organização.
