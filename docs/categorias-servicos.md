# Categorias de procedimentos e serviços

Em `/servicos`, usuários com `services.manage` podem criar, renomear e excluir
categorias próprias da organização. Cada procedimento/serviço pode ter uma
categoria opcional, escolhida tanto na criação quanto na edição. A lista mostra
a categoria e permite filtrar todas, uma categoria específica ou sem categoria.

Excluir uma categoria remove somente os vínculos; os serviços são preservados.
Nomes repetidos na mesma organização são bloqueados, desconsiderando maiúsculas
e espaços nas extremidades. Uma chave estrangeira composta impede associações
entre organizações, além da validação nas ações do servidor.

A migração `0080_service_categories` deve ser aplicada pelo fluxo habitual de
migrações antes de disponibilizar o novo código. Cadastros existentes ficam sem
categoria. Importações continuam preservando a categoria de serviços existentes;
serviços novos importados ficam sem categoria.

Validação local da migração: `npx --no-install tsx --test tests/service-categories.test.ts`.
