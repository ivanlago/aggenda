# Pix direto no agendamento

## Ativação

1. Em **Configurações → Agendamento → Pagamento antecipado**, configure o recebimento de agendamentos.
2. Escolha **Pix direto — conferência pela equipe**.
3. Informe uma chave Pix já registrada no banco, seu tipo, titular, cidade e a conta financeira do Aggenda correspondente ao recebimento.
4. Salve. Em **Produtos e Serviços → Serviços**, defina sinal fixo, percentual ou pagamento integral para os serviços desejados.

A conta financeira organiza o extrato. O dinheiro é enviado à conta bancária vinculada à chave. O Aggenda não verifica a titularidade da chave junto ao banco. Confira os dados antes de publicar o agendamento.

## Fluxo

- O cliente vê o valor do sinal antes de reservar. Após a reserva, a área do cliente apresenta o QR Code e o Pix Copia e Cola no próprio cartão do agendamento; **Ver Pix e acompanhar agendamento** leva a esse cartão. O link individual de gerenciamento também continua disponível.
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

## Agentes de WhatsApp

Atendimento e Secretária usam o tipo/valor de sinal do catálogo e o modo de recebimento da empresa nas orientações. A Secretária encaminha os serviços com sinal para a área do cliente, onde a reserva e o Pix são gerados. Não envia chave inventada nem reserva um horário pago diretamente pela conversa.

No modo Secretária, perguntas sobre Pix consultam a situação do sinal do próprio cliente. “Já fiz o Pix” direciona à reserva para informar o pagamento; a frase não gera baixa. Pix informado aguarda a equipe, e confirmação de presença não ultrapassa o pagamento pendente. O contexto estruturado enviado ao modelo contém o modo e a situação necessária, sem incluir o cadastro da chave bancária nem o campo de token de gerenciamento das reservas.

Testes adicionais: `tests/whatsapp-agents.test.ts`, `tests/whatsapp-navigation.test.ts`, `tests/whatsapp-hybrid.test.ts` e `tests/booking-pix-panel.test.ts`. As APIs de IA, WhatsApp e agenda externa são substituídas por simulações nos testes; nenhum envio real é feito.

## Pagamento integrado

**Provedor padrão de cobranças online** utiliza a integração ativa marcada como padrão em Configurações → Provedores de pagamento: Asaas, Mercado Pago, PagBank ou Efí. O cliente escolhe os meios habilitados no checkout; crédito e débito dependem da integração e da conta do provedor. Na integração Efí atual, o recebimento é Pix.

O destino financeiro é o cadastrado na forma ativa Link de pagamento (Pix para Efí). Sem provedor padrão pronto ou conta financeira ativa vinculada, novas reservas com sinal integrado são bloqueadas antes de ocupar o horário. A cobrança fica vinculada à reserva original, mesmo que o padrão mude depois.

A emissão é registrada antes da chamada externa, com trava contra duplicação. Em caso de falha ou resposta inconclusiva, a reserva mantém a cobrança para conferência, sem nova emissão automática. Webhooks conferem valor e referência antes de registrar o sinal. Pagamento tardio é registrado, mas não reabre uma reserva cancelada/expirada; a equipe deve revisar. O valor do sinal permanece separado do saldo do atendimento.

Validação isolada: `node node_modules/tsx/dist/cli.mjs --test tests/booking-online-payment.test.ts tests/booking-direct-pix.test.ts tests/public-booking.test.ts tests/booking-pix-panel.test.ts`. Não usa credenciais ou cobranças reais.

## Publicação e validação

- Migração: `drizzle/0100_booking_direct_pix.sql`, com uma coluna JSON de configuração na organização. O padrão é `integrated`, preservando o comportamento das empresas existentes.
- Validada em branch isolada Neon `br-icy-sky-au4qz5ae` (`codex/direct-pix-validation-20261112`), sem alterar dados de clientes. A branch usa suspensão após cinco minutos de inatividade.
- Aplicada em 12/11/2026 na branch do banco configurado no projeto, com registro no histórico Drizzle. Conferidos quatro registros de organização e 49 agendamentos antes/depois, todos preservados. Nenhuma chave foi cadastrada ou modo alterado por esta execução.
- Ainda é necessário publicar o código da aplicação para disponibilizar as novas telas em produção.
- Testes isolados: `node node_modules/tsx/dist/cli.mjs --test tests/booking-direct-pix.test.ts tests/public-booking.test.ts`. Cobrem reserva sem Asaas, replay, conferência, isolamento por empresa, baixa única, lançamento no extrato, saldo, cancelamento e expiração.
- Nenhum pagamento real foi realizado nos testes.
