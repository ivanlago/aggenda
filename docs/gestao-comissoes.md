# Gestão de comissões

## Operação

Acesse **Financeiro → Comissões**. A tela reúne atendimentos realizados, produtos vendidos, procedimentos adicionais vendidos no PDV e ajustes. O saldo acumulado considera todos os lançamentos pendentes, inclusive de competências anteriores. Os filtros de competência e situação controlam o extrato, sem ocultar pendências antigas do saldo.

1. Crie regras por beneficiário, origem e procedimento ou produto. Percentual usa o valor líquido; valor fixo é por unidade ou sessão. A regra específica prevalece sobre a geral; em empate, a mais recente. Desativar uma regra afeta novos lançamentos; os calculados mantêm a regra original.
2. Em atendimentos, o beneficiário é o profissional responsável. A regra libera a comissão após conclusão ou após conclusão e recebimento integral.
3. Em vendas, escolha explicitamente o beneficiário dos produtos e procedimentos adicionais, separado do operador do caixa. A opção Definir depois deixa a venda sem comissão apurada até a vinculação na gestão de comissões. O profissional do procedimento principal continua sendo o responsável do atendimento, evitando duplicar a comissão no PDV.
4. Clique em **Atualizar cálculos** para gerar a competência selecionada e revisar cancelamentos e ajustes dos lançamentos existentes. A apuração continua sendo uma operação explícita; não há tarefa agendada ou cálculo automático a cada venda. Antes de quitar, as origens dos lançamentos são verificadas novamente.
5. Registre uma quitação já realizada, individualmente ou por saldo completo do beneficiário. Informe data, conta, forma de pagamento e referência do comprovante. O sistema cria uma despesa paga no financeiro e baixa os lançamentos em uma única transação. Não transfere dinheiro nem chama um provedor bancário.

Uma quitação total deixa o saldo pendente zerado e mantém o extrato e o histórico. Créditos negativos de devoluções são compensados obrigatoriamente, mesmo em uma quitação individual. Se o saldo mudar entre a abertura e a confirmação, a operação exige nova conferência. Repetições da mesma solicitação não duplicam a despesa; solicitações concorrentes também não quitam os mesmos lançamentos duas vezes.

## Pacotes, descontos e cancelamentos

- Produto: usa o total líquido do item após descontos. Sem regra específica, utiliza a comissão calculada e gravada no item na venda.
- Atendimento: a base considera os lançamentos financeiros vinculados, incluindo o sinal; o recebimento integral exige a situação recebida. O preço do atendimento é usado quando não há lançamentos vinculados.
- Pacotes: não se gera comissão antecipada pela venda. O valor líquido adquirido é dividido igualmente entre todas as sessões do pacote, independentemente do preço de catálogo de cada procedimento. Centavos restantes são distribuídos nas primeiras unidades, em ordem de reserva. A comissão só é liberada por sessão consumida e atendimento concluído, observando a regra de recebimento quando exigida.
- Cancelamento antes de quitar: o lançamento fica cancelado, preservando o valor anterior no histórico.
- Cancelamento ou redução depois de quitar: o pagamento original permanece intacto; surge um ajuste negativo para compensação futura. Recuperar a elegibilidade pode cancelar um ajuste ainda pendente ou gerar ajuste complementar.
- Alteração de profissional antes de quitar: o lançamento anterior é preservado como cancelado e a nova regra é aplicada ao novo beneficiário. Depois de quitar, exige estornar a quitação antes de mudar o beneficiário.
- O estorno da quitação cancela a saída financeira e reabre o saldo, mantendo autor, data e motivo no histórico. Quando um ajuste já foi compensado em outra quitação, essa quitação posterior deve ser estornada primeiro.

## Histórico anterior e segurança

Comissões anteriores permanecem com seus estados e datas originais. Pagamentos antigos não recebem despesas financeiras artificiais: aparecem como registros anteriores sem vínculo financeiro. A apuração não presume que o operador de vendas antigas seja o beneficiário; as vendas podem ser vinculadas explicitamente na tela. Nenhuma quitação real foi registrada durante esta implementação.

As operações de escrita exigem finance.manage, validam a clínica do beneficiário, origem e conta e geram auditoria. A leitura exige finance.read. O lançamento financeiro de quitação deve ser gerenciado pela tela de comissões, para evitar divergência entre o financeiro e o saldo. Beneficiários inativos ou antigos podem receber valores já registrados a seu favor.

## Banco e validação

Migration **0076_commission_ledger**: beneficiário explícito na venda, evolução do extrato, histórico de quitações e itens de pagamento. Preserva e identifica comissões anteriores. Foi aplicada pela conexão direta, após teste em PostgreSQL isolado e confirmação de que era a única migration pendente.

Execute **npm run test:commissions**. Os três testes incluem cálculo em centavos e rateio de pacote, autorização nas ações reais e persistência em PostgreSQL isolado: profissional/produto, recebimento, principal do atendimento sem duplicação, clique repetido, concorrência, conta e beneficiário de outra clínica, compensações e estorno com preservação de histórico. A suíte geral anterior passou com 143 aprovações e 2 integrações antigas ignoradas; os testes específicos foram repetidos após os ajustes finais. Build, TypeScript e lint foram executados.

Conferência no navegador: tela carregada, filtros, regras e histórico acessíveis, sem rolagem horizontal em 1265 px úteis. Não havia comissões calculadas na clínica para conferir uma quitação visual real. Os cálculos e as quitações reais não foram acionados.

Evidência: [tela de comissões](./qa-visual-2026-10-17/comissoes-gestao.png).

A conferência no PDV confirmou o seletor de beneficiário com opções da equipe e dos profissionais, separado do operador. Nenhum item foi adicionado ao carrinho e nenhuma venda foi concluída. A aba original do portal do cliente foi preservada e a gestão ficou em uma segunda aba.
