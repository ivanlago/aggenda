# Formas de pagamento e fechamento de caixa

O cadastro em `/financeiro/formas-de-pagamento` é a fonte das opções operacionais de pagamento da empresa: PDV, atendimento, lançamentos financeiros, comissões e cobranças integradas. Cada forma tem nome, classificação, modalidade de recebimento e conta de destino padrão. O operador pode confirmar outra conta ativa da mesma empresa. Formas desativadas deixam de aparecer em novos pagamentos e o histórico mantém o nome registrado.

Pagamentos divididos guardam a conta de cada parcela. O financeiro da venda continua resumido, enquanto o livro de movimentações contabiliza as parcelas sem duplicar os resumos. Confirmações, cancelamentos e estornos geram movimentos líquidos; notificações repetidas não geram novas entradas. Integrações exigem formas cadastradas compatíveis com o provedor. O checkout da assinatura do próprio Aggenda pertence à plataforma e continua separado do catálogo de cada empresa.

O fechamento usa a conta e o período desde a abertura, inclusive períodos com mais de um dia. Saldo esperado = saldo de abertura + entradas − saídas. O valor conferido e a diferença ficam registrados junto com o período e as observações. Bloqueios por conta serializam abertura, fechamento e movimentações. Pagamentos recebidos/pagos sem destino precisam ser regularizados antes do fechamento.

## Migração 0093

A migração é aditiva e preserva os lançamentos e pagamentos existentes. As opções usuais anteriores são inseridas como registros editáveis para as empresas existentes. Nenhuma conta de destino é presumida: configure o padrão ou informe a conta no pagamento. Movimentos antigos com destino conhecido são identificados como legados; o saldo informado na abertura representa a situação inicial conferida.

Validação em 05/11/2026: aplicação em branch Neon isolada `payment-catalog-cash-validation-20261105`, seguida da aplicação no banco configurado do projeto. Em ambas foram preservados 49 lançamentos e 10 pagamentos. A branch de validação foi mantida com suspensão automática do compute.

Script de verificação sem alterações:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/apply-payment-catalog-migration.ts
```

O parâmetro `--apply` aplica a versão registrada no journal e verifica contagens, gatilhos e destinos por empresa na mesma transação. `--host=...` permite a validação numa branch isolada sem modificar o arquivo de ambiente.

## Validação

22 testes passaram nos arquivos `payment-catalog-cash`, `pos-payments`, `commissions` e `attendance-payment`: divisão entre contas, prevenção de dupla contagem, saídas, estorno parcial, repetição de eventos, período de vários dias, isolamento entre empresas e regressões dos provedores. TypeScript também passou. Os testes não efetuam pagamentos reais.
