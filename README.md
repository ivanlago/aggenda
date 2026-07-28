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

O banco recomendado é um projeto Neon separado e vazio. O domínio de produção
planejado é `www.aggenda.app.br`.
