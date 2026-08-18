# Outbox do WhatsApp no Coolify

O Aggenda recebe, registra e processa as mensagens na própria camada de domínio.
O n8n não decide respostas nem executa regras do Core; ele recebe somente
eventos de automações comerciais publicadas. Falhas temporárias deixam o evento
pendente para nova tentativa.

## Fluxo de transição

```text
Meta -> /api/webhooks/whatsapp -> Neon Outbox -> worker Coolify -> Aggenda AI/Core
                                                                    |
                                      automação comercial publicada -> n8n
```

O worker também reconhece `whatsapp.message.send` para envio direto pela Cloud
API e `whatsapp.template.send` para confirmações, reagendamentos, cancelamentos
e lembretes transacionais aprovados pela Meta.

## 1. Banco

Depois de conferir a conexão com o Neon, execute uma vez:

```powershell
npm run db:migrate
```

A migração `0008_oval_tyger_tiger.sql` cria canais, conversas, mensagens e a
Outbox. Ela não altera as tabelas de agenda existentes.

## 2. Aplicação na Vercel

Configure em produção:

- `META_WHATSAPP_VERIFY_TOKEN`: valor criado por nós para validar o webhook;
- `META_WHATSAPP_APP_SECRET`: App Secret do projeto Meta;
- `META_WHATSAPP_ACCESS_TOKEN`: token de produção usado em envios diretos;
- `META_WHATSAPP_GRAPH_VERSION`: versão fixada da Graph API;
- `DATABASE_URL`: conexão pooled do Neon.

Publique a aplicação e cadastre na Meta:

```text
https://www.aggenda.app.br/api/webhooks/whatsapp
```

O token de verificação precisa ser igual a `META_WHATSAPP_VERIFY_TOKEN`.
Assine o campo `messages` do WhatsApp Business Account.

## 3. Associar o número à empresa

Localmente, configure temporariamente as variáveis abaixo e execute:

```powershell
$env:WHATSAPP_ORGANIZATION_ID="UUID_DA_EMPRESA"
$env:META_WHATSAPP_PHONE_NUMBER_ID="PHONE_NUMBER_ID"
$env:META_WHATSAPP_BUSINESS_ACCOUNT_ID="WABA_ID"
$env:META_WHATSAPP_DISPLAY_PHONE_NUMBER="NUMERO_EXIBIDO"
npm run whatsapp:register
```

O script pode ser executado novamente para atualizar o canal.

## 4. Worker no Coolify

Crie um serviço a partir do mesmo repositório e use:

```text
npm run worker:outbox
```

Variáveis obrigatórias do serviço:

- `DATABASE_URL`;
- `AGGENDA_INTERNAL_API_URL`: normalmente `https://www.aggenda.app.br`;
- `AGGENDA_INTERNAL_API_KEY`: segredo compartilhado com a aplicação;
- `N8N_COMMERCIAL_WEBHOOK_URL`: somente quando houver automações comerciais publicadas;
- `N8N_API_KEY`, somente se o webhook comercial exigir o header;
- `META_WHATSAPP_ACCESS_TOKEN` para futuros eventos de envio direto.

Valores iniciais recomendados:

```text
OUTBOX_WORKER_ID=aggenda-worker-1
OUTBOX_BATCH_SIZE=10
OUTBOX_POLL_INTERVAL_MS=2000
OUTBOX_IDLE_INTERVAL_MS=15000
```

Configure política de reinício automático. Um segundo worker pode ser criado
mais tarde: o bloqueio transacional impede processamento concorrente do mesmo
evento.

## 5. Ordem segura da troca

1. Aplicar a migração.
2. Cadastrar o canal da empresa.
3. Publicar a nova aplicação.
4. Iniciar o worker e confirmar conexão com o Neon.
5. Testar o endpoint da Vercel com o número de teste da Meta.
6. Somente então trocar o Callback URL da Meta do n8n para o Aggenda.
7. Confirmar que o evento terminou como `processed` na Outbox.

Em caso de problema, restaure temporariamente o Callback URL anterior da Meta.
As mensagens já recebidas continuarão registradas no Neon.
