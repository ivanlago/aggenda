# Limites de exibição de listas

## Estratégia

- Clientes: 20 registros por consulta ao banco, total com o mesmo filtro de organização e escopo profissional, busca preservada nos links, ordenação estável por nome e ID.
- Auditoria: 20 registros por consulta, acesso ao histórico completo por páginas, ordenação estável por data e ID.
- Histórico detalhado de vendas: 20 vendas por consulta. Primeiro são selecionadas as vendas da página; depois, todos os seus itens e pagamentos. A busca por produto seleciona a venda inteira, evitando recibos incompletos.
- Demais coleções: `PaginatedCollection` limita a renderização a 10 cartões ou 20 linhas de tabela, com seleção de 10, 20 ou 50 itens. Mudanças na coleção filtrada reiniciam a página. Blocos de cartões têm altura máxima e rolagem própria; tabelas extensas usam um contêiner com rolagem.
- Paginação local mantém a coleção completa em memória; limita a interface, mas não substitui paginação de banco. Agregações, saldos e exportações continuam usando todos os dados necessários.

## Cobertura

Cadastros de serviços e categorias; equipe; estoque (produtos, lotes, movimentações e categorias); pacotes; históricos do cliente; fotografias e pares; registros clínicos e anexos; itens, vendas, adicionais e orçamentos do atendimento; documentos; financeiro (lançamentos, cobranças, comissões, caixas, conciliação e notas); CRM (oportunidades por etapa, atividades, propostas, configurações e relatórios); retornos; campanhas e vouchers; salas e bloqueios de agenda; portal do cliente; administração de empresas e usuários.

Listas que já tinham paginação própria (histórico de documentos, biblioteca de orçamentos, cobranças e rastreabilidade/busca de lotes) mantêm seus controles. Catálogos do PDV, sugestões de busca e áreas com altura/rolagem já controladas mantêm seus limites. Navegação, calendários, indicadores e opções fixas não são paginados. Campos editáveis de formulários não são divididos em páginas para preservar o envio completo.

## Verificação

`npm run test:lists` verifica navegação até o último registro, alteração de tamanho, reinício após filtro, lista vazia, HTML de tabela e preservação de busca nos links. Executar também TypeScript e ESLint nos arquivos alterados.
