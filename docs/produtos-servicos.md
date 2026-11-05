# Produtos e Serviços

O catálogo fica em `/produtos-servicos`, com três abas:

- Produtos e Serviços: mantém os cadastros, imagens, categorias, preços e controles de estoque existentes.
- Pacotes: mantém modelos, versões e saldos dos clientes.
- Kit de Produtos/Serviços: cadastra composição com quantidades inteiras, preço, descrição e status; permite editar e desativar kits.

Os endereços `/servicos`, `/produtos`, `/estoque` e `/pacotes` redirecionam ao catálogo. Os filtros e a aba de pacotes dos clientes são preservados. Rotas de compras e lotes continuam disponíveis.

O menu segue Dashboard, Agenda, Venda e orçamento, Clientes (ou a terminologia configurada), Produtos e Serviços, CRM e as demais áreas existentes. Serviço/Serviços são nomes fixos; os campos correspondentes foram retirados de Configurações/Terminologia. Os identificadores internos e os registros anteriores são preservados.

## Banco de dados

A migração Drizzle `0092_catalog_kits` cria somente a tabela `catalog_kits`, seu índice, a chave da organização e a restrição de preço. Ela deve ser aplicada com o fluxo habitual de migrações antes de disponibilizar a aba de kits. Não é necessário importar novamente os produtos, serviços ou pacotes.

O cadastro de kits exige `services.manage`. Cada item é validado no servidor contra o catálogo ativo da organização; a atualização do kit também é limitada à organização autenticada. Alterações são auditadas. A criação de um kit não movimenta estoque nem cria vendas ou sessões de pacotes.

## Verificação

`node node_modules/tsx/dist/cli.mjs --test tests/catalog-kits.test.ts tests/package-catalog.test.ts tests/permissions.test.ts`

Os testes de kits validam quantidades e preços, composição mista, persistência da composição, preservação de registros anteriores e restrições da migração em Postgres local isolado (PGlite).
