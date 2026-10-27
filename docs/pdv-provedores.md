# Provedor padrão do PDV

Asaas, Mercado Pago e PagBank podem ser selecionados no PDV independente, em Venda e orçamento. A empresa conecta e valida suas próprias credenciais em Financeiro → Pagamentos. A opção **Usar como provedor padrão no PDV** aparece quando a conexão e o webhook estão prontos.

Existe um único padrão por empresa. Marcar outro provedor substitui o anterior, sem desconectá-lo. Desmarcar uma opção que já não é o padrão não altera a seleção vigente. O operador ainda pode escolher outro provedor habilitado ou recebimento manual em cada nova venda. Vendas existentes permanecem vinculadas ao provedor em que foram criadas.

## Meios de pagamento

- Asaas Checkout: Pix e cartão de crédito à vista.
- Mercado Pago Checkout Pro: meios habilitados na conta, incluindo Pix, cartão e boleto.
- PagBank Checkout: Pix, cartão de crédito à vista e boleto, conforme habilitação da conta.

São páginas de pagamento hospedadas pelos provedores. Maquininhas físicas continuam sendo registradas como recebimento manual. O caixa interno do atendimento continua manual nesta etapa.

## Confirmação e reservas

A criação não confirma pagamento. O servidor calcula o valor, reserva os produtos e mantém financeiro, venda e pacotes pendentes. A confirmação depende de dados consultados na API da conta correspondente. Webhooks acionam essa consulta; o redirecionamento do navegador não altera o recebimento. A página de acompanhamento permite consulta manual e cópia do link público.

As credenciais, ambiente, identificador do checkout, moeda e valor são conferidos antes da baixa. Tentativas simultâneas e falhas de comunicação não geram novas cobranças automaticamente. A seleção do padrão é isolada por empresa.

O checkout dura 24 horas. A reserva permanece até o pagamento ou cancelamento confirmado. O cancelamento primeiro desativa o checkout e consulta suas tentativas. Havendo transação em análise, autorização ou boleto/Pix ainda ativo no PagBank, o estoque permanece reservado até resolver a pendência no provedor. O Asaas cancela cobranças pendentes antes da liberação. Criação inconclusiva sem ID exige suporte para Asaas e PagBank.

Estornos são solicitados no painel do provedor. Estornos parciais, contestações, pagamentos adicionais e aprovações tardias vão para conferência; pacotes ficam suspensos. A devolução física de produtos deve ser registrada separadamente. Taxas e líquido aparecem quando o provedor fornece esses dados.

Asaas e PagBank mantêm a conexão original enquanto houver vendas que dependam dela para acompanhamento. Para trocar credenciais com vendas vinculadas, procure suporte. Alterar o padrão do PDV não exige alterar credenciais.

## Validação e limites

Testes automatizados exercitam checkout, consulta, baixa, estorno parcial, cancelamento e troca de padrão em PostgreSQL isolado, com dados sintéticos e APIs simuladas. Nenhuma cobrança real é criada nesses testes. A homologação real de cada conta, incluindo o webhook, permanece necessária. Conectar uma conta não comprova autorização de todos os meios de pagamento pelo provedor.

Referências: [Asaas Checkout](https://docs.asaas.com/reference/criar-novo-checkout), [cobranças por checkout Asaas](https://docs.asaas.com/reference/listar-cobrancas), [PagBank Checkout](https://developer.pagbank.com.br/docs/checkout).
