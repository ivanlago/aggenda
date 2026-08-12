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

O evento recebido inclui `whatsappServiceCode` e `workflowProduct`. O worker procura
o webhook específico e usa `N8N_FALLBACK_WEBHOOK_URL` apenas como compatibilidade:

- `N8N_CHAT_WEBHOOK_URL`;
- `N8N_CHAT_AI_WEBHOOK_URL`;
- `N8N_CORE_WEBHOOK_URL`;
- `N8N_CORE_AI_WEBHOOK_URL`.

## Estado da implementação

- Assistido: mensagens manuais contextuais para confirmação e cancelamento.
- Notify: confirmação, reagendamento, cancelamento e lembrete 24 horas antes via templates Meta e outbox com retentativa.
- Menu e Chat: workflow determinístico parametrizado, com menu, informações e handoff.
- Chat + AI: workflow com linguagem natural, base aprovada e handoff.
- Core + AI: dez cenários do MVP, incluindo consulta, reagendamento e cancelamento com confirmação.
- Métricas: entradas, saídas e chamadas de IA contabilizadas mensalmente; alertas de franquia visíveis no painel.

## Dependências para ativação comercial

1. Criar e aprovar na Meta quatro templates com quatro variáveis no corpo:
   `META_TEMPLATE_APPOINTMENT_CONFIRMATION`, `META_TEMPLATE_APPOINTMENT_RESCHEDULE`,
   `META_TEMPLATE_APPOINTMENT_CANCELLATION` e `META_TEMPLATE_APPOINTMENT_REMINDER`.
2. Manter o worker do Coolify ativo; ele consulta e enfileira lembretes a cada cinco minutos. O intervalo pode ser alterado por `WHATSAPP_REMINDER_INTERVAL_MS`.
3. Importar e homologar os workflows de `workflows/commercial`, configurar a credencial `Aggenda API - n8n`, o ID da organização e as URLs `N8N_*_WEBHOOK_URL` no worker.
4. Executar os dez cenários em número Meta de teste antes de ativar cada organização.
