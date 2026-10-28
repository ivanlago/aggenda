# Padrão de cadastros

Aplicado a produtos, procedimentos e lançamentos financeiros.

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
