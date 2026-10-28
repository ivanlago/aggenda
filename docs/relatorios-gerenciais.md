# Relatórios gerenciais e de marketing

A área `/relatorios` reúne seis relatórios, com consulta na tela e emissão em PDF e Excel (`.xlsx`). A aba do CRM passou a se chamar **Indicadores** e oferece um link para emissão dos relatórios.

| Relatório | Critério |
| --- | --- |
| Resumo gerencial | Compara intervalos de igual número de dias. Vendas concluídas pela venda; recebimentos/despesas pela realização; atendimentos concluídos pela data agendada; novos clientes pelo cadastro. Movimento líquido não é lucro nem saldo bancário. |
| Fluxo de caixa | Realizados pela realização e pendentes pelo vencimento. Exclui cancelados e realizados sem data de realização. Não calcula saldo inicial. |
| Contas a pagar e receber | Seleção pelo vencimento; situação atual e atraso na data da emissão, com faixas de atraso. |
| Vendas e orçamentos | Vendas pela data da venda; orçamentos pela emissão. Situação atual. Totais incluem apenas vendas concluídas; orçamentos não se somam às vendas. Valores por item podem diferir do pedido devido ao desconto geral. |
| Origem e conversão | Oportunidades criadas no período, com situação atual. Conversão: ganhas / (ganhas + perdidas). Sem encerramentos, não apresenta taxa. Valor ganho não equivale a recebimento. |
| Clientes inativos | Último atendimento concluído até a referência, com pelo menos 30/60/90/180 dias de intervalo. Exclui clientes nunca atendidos. Mostra o próximo agendamento atualmente marcado ou confirmado após a referência. Não dispara mensagens. |

Filtros de datas aceitam até 366 dias inclusivos. Inativos usa apenas a data de referência. Financeiros oferecem conta, categoria, centro de custo, situação e busca por descrição/cliente; inativos oferece busca por nome/telefone. Consultas usam o fuso da organização.

A tela pagina os registros e limita a rolagem das tabelas. Os arquivos incluem todos os registros filtrados, com identificação da empresa, emissão, filtros e notas de interpretação. Exportar consulta novamente os dados, portanto alterações entre consulta e emissão podem afetar os resultados. Excel mantém valores e datas tipados e escreve textos como texto, nunca como fórmulas. PDF repete cabeçalhos, pagina e mantém linhas comuns na mesma página.

As permissões são verificadas na página, no endpoint `/api/reports` e no carregador. O resumo exige acesso financeiro, vendas/estoque, agenda e clientes; inativos exige gestão de clientes, CRM e agenda. Cada consulta limita os dados à empresa autenticada. Arquivos têm cache privado desabilitado. Não há exportação de prontuário.

Validação: testes com PostgreSQL local em memória (PGlite) para os seis relatórios, isolamento entre empresas, datas/fuso, conversão, inatividade e permissões; testes do endpoint e arquivos PDF/Excel com 105 registros; testes existentes de páginas financeiras e paginação. Conferência visual da página com dados fictícios em Chrome desktop e celular e do PDF renderizado. Sem alteração de banco ou publicação.
