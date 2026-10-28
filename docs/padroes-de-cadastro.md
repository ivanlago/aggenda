# Padrão de cadastros

Aplicado a produtos, procedimentos, lançamentos financeiros, pacotes e cobranças.

## Página

- A ação principal abre o cadastro do item: Novo produto, Novo procedimento ou Novo lançamento.
- Ao lado fica a ação secundária: Categorias ou Cadastros financeiros.
- Cadastros auxiliares são gerenciados em listas com busca e ações, sem ocupar o início da lista de itens.

## Formulário

Use `ModalShell`, `FormSection`, `ActionForm` e `FormActions`.

1. Identificação.
2. Classificação.
3. Dados da operação (valores, estoque, duração ou vencimento).
4. Informações adicionais.

Criação e edição compartilham os campos e a ordem. Campos obrigatórios têm rótulo com asterisco. O rodapé oferece Cancelar / Salvar, ou Cancelar / Salvar alterações. O diálogo fecha após o sucesso do cadastro principal e pede confirmação antes de descartar alterações.

## Cadastro rápido

Use `ReferenceSelect` para vínculos com categorias, subcategorias, contas e centros de custo. A ação de cadastro rápido substitui temporariamente o conteúdo do mesmo diálogo. O formulário principal continua montado, oculto e inerte. O formulário auxiliar é um irmão, nunca um formulário aninhado.

O servidor devolve o registro criado. O campo o seleciona imediatamente, sem depender do término de uma atualização de página. Categorias de produtos, procedimentos e financeiro continuam sendo entidades separadas.

## Gestão e histórico

Use `ReferenceManager` para listar, buscar, criar e renomear os cadastros auxiliares.

- Contas, categorias financeiras e centros de custo permitem desativação e reativação; lançamentos existentes permanecem vinculados. Novos lançamentos rejeitam referências inativas no servidor.
- A edição financeira altera apenas o nome; tipo e saldo inicial permanecem preservados.
- A renomeação de categoria financeira também atualiza seu nome nos lançamentos vinculados, usados pelos relatórios.
- Categorias de produtos com vínculos exigem reclassificação antes da exclusão.
- A exclusão de categoria de procedimentos informa que os procedimentos ficarão sem categoria.
- As ações verificam a permissão do módulo e restringem cada operação à empresa autenticada.

Não é necessária migração de banco para esse padrão.

## Cobranças e pacotes

- Nova cobrança usa o mesmo diálogo, com Conta a receber, Pagador e Provedor e condições. A confirmação usa o verbo Gerar cobrança, pois emite uma cobrança externa.
- Pacotes separa Modelos de pacotes de Pacotes dos clientes. O cadastro usa busca e seleção de procedimentos; somente os itens escolhidos participam da composição.
- A edição de um modelo cria outro registro e desativa o anterior. Compras e assinaturas anteriores mantêm seu modelo, preço, validade e composição. Orçamentos que referenciem o modelo desativado precisam ser revistos.
- Vender este pacote direciona a Venda e orçamento com o pacote no carrinho e Tipo de item em Pacotes. Não há outro fluxo de venda na página de pacotes.
- Registrar pacote anterior é uma operação administrativa com permissão para gerenciar clientes, justificativa, data original, validade e saldos. Preserva os totais originais e importa os contadores históricos; não cria atendimentos fictícios, receita, venda ou cobrança. A operação é auditada e a repetição da mesma solicitação não duplica as sessões.
- A consulta de pacotes distingue sessões disponíveis agora, reservadas e utilizadas. Pacotes vencidos, cancelados ou aguardando pagamento não apresentam saldo disponível para novas utilizações.
