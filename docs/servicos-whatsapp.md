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

## Próximas entregas

1. Criar os eventos programados e templates do Notify.
2. Medir mensagens de saída e chamadas/tokens de IA.
3. Implantar e homologar uma URL n8n para cada produto.
4. Exibir alerta de franquia e permitir compra de excedentes.
5. Automatizar onboarding de número e credenciais por organização.
