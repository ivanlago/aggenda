# Pix direto no agendamento

## Ativação

1. Em **Configurações → Provedores de pagamento**, abra **Pagamento antecipado de agendamentos**.
2. Escolha **Pix direto — conferência pela equipe**.
3. Informe uma chave Pix já registrada no banco, seu tipo, titular, cidade e a conta financeira do Aggenda correspondente ao recebimento.
4. Salve. Em **Produtos e Serviços → Serviços**, defina sinal fixo, percentual ou pagamento integral para os serviços desejados.

A conta financeira organiza o extrato. O dinheiro é enviado à conta bancária vinculada à chave. O Aggenda não verifica a titularidade da chave junto ao banco. Confira os dados antes de publicar o agendamento.

## Fluxo

- O cliente faz a reserva pela área do cliente e abre **Ver Pix e acompanhar agendamento**.
- A página apresenta valor, titular, chave, QR Code gerado localmente e Pix Copia e Cola exclusivo daquela reserva.
- O prazo para informar o pagamento usa `depositExpirationMinutes` do serviço (padrão: 30 minutos). O QR Code estático não pode ser invalidado no banco; por isso o Aggenda deixa de exibi-lo após o prazo e orienta o cliente a falar com a equipe se já pagou.
- **Já fiz o Pix** registra somente a declaração do cliente. Não gera baixa nem confirmação automática do agendamento.
- A Agenda identifica **Pix a conferir**. Na edição da reserva, um usuário com `finance.manage` confere o crédito no banco, marca a declaração e usa **Confirmar recebimento do Pix**.
- A confirmação registra o sinal no financeiro e no extrato da conta configurada, confirma o agendamento e dispara as sincronizações já existentes. O saldo restante fica em um lançamento separado.
- O sinal não permite emissão paralela de cobrança online ou baixa genérica pelos lançamentos. A conferência é feita pela Agenda, de forma auditada e protegida contra repetição.

## Prazos, cancelamento e histórico

O endpoint existente `/api/cron/booking-reservations` expira reservas não pagas, inclusive Pix direto. Precisa continuar sendo executado pelo agendador externo com `CRON_SECRET`. Reservas cujo cliente já informou pagamento ficam aguardando a equipe e não são canceladas automaticamente. Não foi criada uma nova automação externa nesta alteração.

Cancelar uma reserva sem pagamento cancela o lançamento pendente do sinal. Cancelar uma reserva já paga **não estorna o dinheiro no banco** e preserva o recebimento. A equipe deve tratar devolução e seu registro financeiro conforme a política da empresa.

Os dados Pix e a conta financeira ficam guardados na reserva. Alterações de chave ou modo afetam somente novas reservas.

## Pagamento integrado

**Pagamento integrado — Asaas** continua disponível no mesmo seletor. O fluxo de sinal integrado ainda utiliza a conta Asaas conectada pela própria empresa. Mercado Pago, PagBank e Efí não foram acrescentados ao sinal de agendamento nesta alteração.

## Publicação e validação

- Migração: `drizzle/0100_booking_direct_pix.sql`, com uma coluna JSON de configuração na organização. O padrão é `integrated`, preservando o comportamento das empresas existentes.
- Validada em branch isolada Neon `br-icy-sky-au4qz5ae` (`codex/direct-pix-validation-20261112`), sem alterar dados de clientes. A branch usa suspensão após cinco minutos de inatividade.
- Aplicada em 12/11/2026 na branch do banco configurado no projeto, com registro no histórico Drizzle. Conferidos quatro registros de organização e 49 agendamentos antes/depois, todos preservados. Nenhuma chave foi cadastrada ou modo alterado por esta execução.
- Ainda é necessário publicar o código da aplicação para disponibilizar as novas telas em produção.
- Testes isolados: `node node_modules/tsx/dist/cli.mjs --test tests/booking-direct-pix.test.ts tests/public-booking.test.ts`. Cobrem reserva sem Asaas, replay, conferência, isolamento por empresa, baixa única, lançamento no extrato, saldo, cancelamento e expiração.
- Nenhum pagamento real foi realizado nos testes.
