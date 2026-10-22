# Paleta do aplicativo

Adequação autorizada em 21/10/2026 para aproximar o app da landing page.

- Estrutura institucional/menu e títulos: azul-petróleo `#123C46`.
- Interações, botões e abas que usam a marca: teal `#007F78`; hover `#006B65`.
- Seleção suave: `#DDF5F1`; superfície `#EDF6F4`; fundo `#F7FAFA`.
- Texto principal: `#172B35`; cabeçalho branco.
- Menu: textos claros, item atual em fundo claro com indicador teal, foco claro e submenu legível, inclusive no menu móvel.

Tokens em `globals.css`; classes estruturais em AppShell, AppHeader e PageHeader. Estilos do menu limitados a `.app-sidebar`, sem recolorir gráficos, situações da agenda, recebimentos, despesas, alertas ou ações destrutivas. As cores semânticas explícitas permanecem intactas. Os tokens compartilhados também harmonizam formulários públicos; a landing preserva sua paleta própria.

Contrastes calculados: branco/teal 4,88:1; branco/petróleo 11,93:1; texto secundário do menu/petróleo 7,32:1; petróleo/seleção suave 10,45:1. São verificações das combinações indicadas, não uma auditoria integral de acessibilidade.

Sem alteração de layout, dados, permissões, cobrança ou integrações. A validação usa navegação e leitura de registros existentes, sem executar atendimentos ou pagamentos.

Validação local: TypeScript e ESLint aprovados. Agenda, Financeiro e Atendimento conferidos no navegador; abas ativas em teal, valores financeiros positivos/negativos mantendo cores próprias, sem transbordamento horizontal. Menu móvel conferido em viewport de 390 px. Ajuste responsivo pontual no cabeçalho: busca ocupa uma linha e atalhos não quebram o texto, evitando compressão no celular. Contraste calculado nas combinações acima. Não publicado em produção nesta alteração.
