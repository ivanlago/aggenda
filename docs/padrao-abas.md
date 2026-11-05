# Padrão de abas do Aggenda

Todas as abas usam as classes compartilhadas de `src/app/globals.css`:

- `app-tabs`: faixa de navegação com linha inferior e rolagem horizontal quando os itens não cabem, sem barra vertical.
- `app-tab`: item da navegação; a seleção tem bordas laterais, destaque superior na cor da marca e base aberta para o conteúdo.
- `app-tab-content`: conteúdo com fundo branco e padding de 24 px (16 px no celular), sem contornos laterais externos. Em abas aninhadas, o padding horizontal é aplicado apenas pelo painel externo.
- `app-tabs--secondary`: variação compacta para abas internas.

A seleção é indicada por `aria-current="page"` em links de navegação e `aria-selected="true"` em controles com `role="tab"`. Seletores existentes que alternam formulários mantêm seus estados `aria-pressed` ou `aria-expanded` e recebem o mesmo visual.

Não usar `primary-button` ou `secondary-button` para representar a aba ativa. Esses estilos são reservados às ações. A mudança de aba deve preservar o comportamento de navegação, os formulários e os dados em edição; painéis ocultos continuam montados quando o componente já mantinha esse comportamento.

Aplicações: catálogo e pacotes, estoque, configurações e instituições de pagamento, CRM, atendimento e suas ferramentas, venda/orçamento e seus históricos, documentos, relatórios e demonstração do produto na página pública.

Grades e linhas flexíveis dentro dos painéis devem poder encolher (`min-width: 0`). Tabelas largas devem rolar em seus próprios contêineres, sem aumentar a largura do painel ou da página. Não ocultar o transbordamento do conteúdo inteiro: menus e seletores precisam continuar visíveis.

As tabelas de listagem usam `app-list-table`, sem largura mínima fixa em pixels. As células têm espaçamento horizontal compacto e quebra normal de palavras; não quebrar algarismos de valores monetários apenas para eliminar rolagem. Manter a rolagem local como alternativa quando a tela for realmente estreita.
