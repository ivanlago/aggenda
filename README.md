# Aggenda

Plataforma de agenda e gestão de atendimento para negócios de serviços.

## Princípios do produto

- domínio neutro: organização, profissional, cliente, serviço e agendamento;
- isolamento obrigatório por organização;
- funcionalidades específicas de segmento como módulos, não como núcleo;
- automações idempotentes;
- nenhuma credencial ou dado compartilhado com o CliniHora.

## Desenvolvimento

```bash
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Variáveis locais obrigatórias:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` para conectar a agenda de cada profissional
- `GOOGLE_TOKEN_ENCRYPTION_KEY` (recomendado em produção; segredo aleatório com 32+ caracteres)

Para testar a cobrança recorrente pelo Asaas:

- crie uma conta independente em `https://sandbox.asaas.com`;
- gere uma chave de API sem permissão para saques;
- configure `ASAAS_ENVIRONMENT=sandbox`, `ASAAS_API_KEY`,
  `ASAAS_WEBHOOK_TOKEN`, `ASAAS_PLAN_MONTHLY_VALUE`, `ASAAS_PLAN_QUARTERLY_VALUE`,
  `ASAAS_PLAN_SEMIANNUAL_VALUE` e `ASAAS_PLAN_ANNUAL_VALUE`;
- configure no Asaas o webhook
  `https://SEU_DOMINIO/api/webhooks/asaas`, usando o mesmo token de autenticação;
- habilite somente eventos de cobranças, assinaturas e Checkout.

O Checkout recorrente aceita cartão e o acesso só é ativado após confirmação
por webhook. As credenciais de produção devem existir apenas no ambiente de
produção da hospedagem.

O banco recomendado é um projeto Neon separado e vazio. O domínio de produção
planejado é `www.aggenda.app.br`.
