# Workflows comerciais da Aggenda

Os arquivos em `commercial/` são modelos horizontais importáveis no n8n. Os
arquivos em `presets/` configuram linguagem, campos e políticas por segmento sem
duplicar a lógica dos produtos.

## Catálogo

| Arquivo | Produto | Fonte operacional |
| --- | --- | --- |
| `aggenda-chat.json` | Chat determinístico | Conteúdo cadastrado |
| `aggenda-chat-ai.json` | Chat + AI | Conteúdo aprovado e Gemini |
| `aggenda-flow.json` | Flow determinístico | Automação externa publicada |
| `aggenda-flow-ai.json` | Flow + AI | Automação externa escolhida pela AI |
| `aggenda-core.json` | Core determinístico | Banco e agenda da Aggenda |
| `aggenda-core-ai.json` | Core + AI | Banco da Aggenda por decisões estruturadas |

## Configuração obrigatória

Depois de importar, selecione as credenciais com estes nomes:

- `WhatsApp OAuth account` no trigger.
- `WhatsApp account` no envio.
- `Aggenda API - n8n` nos modelos Core.
- `Google Gemini(PaLM) Api account` nos modelos com AI.

Em cada cópia por tenant, configure:

- `phoneNumberId` do WhatsApp.
- `X-Clinic-Id` nos nós HTTP do Core.
- Nome, horários, endereço, serviços, FAQ e políticas da empresa.
- Endpoint HTTPS publicado nos modelos Flow.
- Modelo, limites e credencial de AI quando aplicável.

Não ative um workflow que ainda contenha `CONFIGURE_` em qualquer parâmetro.

## Garantias dos modelos

- As versões sem AI usam estados e menus determinísticos.
- Flow só confirma sucesso após retorno positivo do endpoint configurado.
- Core consulta disponibilidade e persiste o agendamento antes da confirmação.
- Core determinístico atualiza a data da sessão quando a API encontra a próxima
  disponibilidade.
- Ações críticas devem manter confirmação explícita e idempotência no backend.
- Handoff, consentimento, opt-out e inbox ainda dependem da plataforma comum
  descrita no planejamento e não devem ser simulados apenas no workflow.

## Geração e validação

```powershell
node scripts/build-commercial-chatbot-workflows.mjs
node scripts/validate-commercial-chatbot-workflows.mjs
```

O gerador usa `Aggenda - Chatbot - corrigido.json` como referência funcional e
remove IDs de credenciais antes de produzir os modelos comerciais.
