# Estoque por lote, validade e recolhimento

## Implantação

1. Acesse **Estoque → Movimentação**. O mesmo formulário registra operações comuns e por lote. A opção **Lotes e recolhimentos**, dentro dele, concentra a identificação do saldo e a ativação; os links de cada lote abrem rastreabilidade e acompanhamento. A migração não inventa lotes nem modifica saldos existentes.
2. No cadastro de produto, use a unidade física na qual o saldo e as aplicações serão registrados: unidade, mL, mg, g ou UI. Não há conversão automática de frascos para mL, diluições ou unidades de potência. Com saldo ou controle ativo, a unidade não pode ser alterada; cadastre outra apresentação quando necessário.
3. Em **Movimentação → Entrada**, marque **Identificar esta entrada por lote e validade** quando o produto ainda não tiver lotes. Em **Origem da quantidade**, use **Identificar saldo já existente — não aumenta o estoque** para informar os lotes reais do saldo de venda e de consumo. Essa opção não aumenta o estoque. Use **Nova entrada — aumenta o estoque** para um novo recebimento. Para produtos já controlados por lote, os campos necessários aparecem automaticamente.
4. Confira fornecedor, código, validade e quantidade. O código é normalizado para maiúsculas; um mesmo lote não pode receber outra validade nem ser reabastecido enquanto bloqueado.
5. Na opção **Lotes e recolhimentos**, selecione o produto e use **Ativar controle por lote após conferência** somente depois que os saldos de venda e consumo estiverem totalmente distribuídos. O servidor confere os totais e não permite ativação incompleta. A ativação pode começar com saldo zero.

Produtos que nunca tiveram lotes cadastrados continuam com o controle anterior. Depois de cadastrar o primeiro lote, as movimentações comuns e vendas ficam bloqueadas até concluir a distribuição e ativação. Para bloquear por validade todos os produtos relevantes, configure e ative cada um deles. Não existe desativação de controle por lote na interface.

## Operação

- Entrada: use **Movimentação → Entrada**, selecione destino (venda ou consumo) e registre quantidade na unidade do produto.
- Transferência: em **Movimentação → Transferir para consumo**, selecione o lote; a operação preserva lote e validade. Lotes vencidos ou bloqueados não são transferidos para utilização.
- Venda e ficha técnica: alocação automática FEFO (primeiro vencimento, primeira saída). Só considera lotes ativos com validade igual ou posterior ao dia atual no fuso da clínica. No PDV, o saldo disponível exclui vencidos e bloqueados; a validação final é transacional no servidor.
- Aplicação clínica: escolha o lote realmente utilizado na consulta. Produto, código, validade e unidade são conferidos no servidor. Ao finalizar o registro clínico, há baixa e vínculo com paciente, atendimento e autoria; salvar rascunho não baixa estoque. Finalize antes de concluir o atendimento.
- Conclusão do atendimento: desconta apenas a diferença entre a ficha técnica e o que já foi aplicado para o mesmo produto. Aplicações acima da ficha técnica mantêm o consumo real, sem gerar créditos artificiais.
- Reabertura: devolve apenas o consumo automático do procedimento aos seus lotes e destinos originais. Material já registrado como aplicado no paciente não volta automaticamente ao estoque. Evoluções originais e adendos continuam preservados; um adendo não realiza uma nova baixa.
- Vencimento: o lote permanece no saldo físico, mas fica indisponível para novas saídas de uso/venda. A data de validade é inclusiva, no fuso da clínica. Este campo representa a validade cadastrada do lote; não calcula validade após abertura ou reconstituição.
- Descarte/devolução ao fornecedor: permite saída de lote vencido ou bloqueado, com motivo e destino registrados. Não há pagamento ou aviso automático ao fornecedor.
- Estorno de venda: restaura as alocações originais, preservando quarentena/recolhimento. Se o recolhimento já estava encerrado e voltar saldo, ele reabre. Devolução de venda antiga sem lote conhecido fica em lote de quarentena, sem validade comprovada, e não pode ser liberada para uso/venda.

Não há alteração automática do conteúdo de registros clínicos antigos. Rascunhos com aplicações livres precisam selecionar um lote cadastrado antes da finalização. Produtos trazidos de fora precisam de cadastro e entrada no estoque de consumo para integrar a rastreabilidade.

## Recolhimento (recall)

Na página do lote, **Iniciar recolhimento** exige motivo e confirmação. Bloqueia permanentemente novas utilizações/vendas desse lote e cria acompanhamentos a partir de aplicações, consumos automáticos e vendas, inclusive histórico estornado. Registros anteriores ao recurso são procurados por correspondência exata do nome do produto e código do lote (ou identificador do lote quando disponível). Grafias diferentes, documentos externos e vendas antigas sem lote não permitem identificar automaticamente todos os afetados: a equipe deve revisar essas fontes.

A equipe clínica registra contato, providência e conclusão. O Aggenda **não envia mensagens nem define conduta clínica**. Vendas sem cliente identificado mostram os contatos do recibo quando disponíveis e exigem conferência manual. Uma pessoa pode aparecer em mais de uma operação, para preservar a rastreabilidade de cada atendimento/venda.

O encerramento exige todos os acompanhamentos concluídos e saldo físico do lote zerado por descarte/devolução. Histórico, justificativas, autoria e bloqueio permanecem. Quarentena preventiva pode ser liberada com justificativa, mas lote recolhido ou devolução sem validade comprovada não pode ser liberado.

## Acesso, integridade e verificação

Gestão de lotes exige `inventory.manage`. Pacientes, contatos e anotações de acompanhamento exigem acesso clínico; profissionais veem somente pacientes já vinculados à própria agenda. Recepção/financeiro não recebem acesso clínico por este recurso. O acompanhamento exige `clinical.manage` e valida novamente o paciente no servidor.

Operações usam transações e bloqueio do produto/lotes para impedir consumo acima do saldo e concorrência entre consumo, venda e bloqueio. Quantidades por lote são positivas e têm até três casas decimais. A divergência entre saldo agregado e lotes impede nova alocação. Cada alocação preserva produto, lote, destino, origem, quantidade, autoria e estorno. Reenvio da mesma finalização clínica não duplica a baixa. Movimentações e ações de recolhimento têm auditoria.

Migração: `0078_inventory_lot_control`. Cria tabelas de lotes, alocações, recolhimentos e acompanhamentos, além de ativação por produto. Nenhum lote, recolhimento ou movimentação real é criado pela migração.

Validação: `npx --no-install tsx --test tests/inventory-lots.test.ts`. Executa migração e ações reais em PostgreSQL isolado: saldos anteriores, ativação, FEFO, vencimento, clínicas diferentes, aplicação e repetição, conclusão sem baixa duplicada, reversão, recall, quarentena, descarte, autorização e PDV com rollback financeiro e estorno. Nenhuma comunicação externa ou pagamento real é executado.

As telas têm paginação de 50 lotes/destinações/acompanhamentos; a implantação lista até 500 produtos e o editor até 500 lotes elegíveis ordenados por vencimento. Não é integração com comunicados de fabricante/autoridade nem prova de que um produto foi fisicamente aplicado: a seleção e a conferência continuam sendo responsabilidade da equipe.


## Evidências da entrega — 18/10/2026

- Migração aplicada ao banco conectado pela conexão direta, após validação isolada e conferência de que somente a 0078 estava pendente. Saldos reais preservados; nenhum lote foi inventado ou ativado.
- Compilação de produção, TypeScript, lint dos arquivos alterados e `drizzle-kit check` passaram.
- Suíte geral: 149 testes encontrados, 146 aprovações, duas integrações antigas ignoradas e uma falha na preparação do cenário clínico, que ainda não criava as tabelas consultadas pelo novo seletor. A preparação foi atualizada; a repetição dos quatro testes clínicos/de lotes passou, incluindo ações reais do PDV.
- Navegador autenticado: formulário de lote, origens de saldo, destinos, filtros e conferência por produto carregados. Ativação bloqueada para os três produtos com saldos ainda sem lote. Largura de documento e área útil iguais a 1265 px. Nenhuma movimentação, venda ou recolhimento real executado.
- Não havia lotes reais para conferir a página de destinações e acompanhamentos com dados no navegador; esses fluxos de escrita foram exercitados nos testes isolados.
- [Captura da tela](./qa-visual-2026-10-18/estoque-lotes.png).


## Unificação da movimentação — 19/10/2026

- O botão principal **Movimentação** reúne Entrada, Saída / ajuste / descarte, Transferir para consumo e Retirada para uso interno. Não há botão paralelo de movimentação por lote no topo do estoque.
- Produto e saldos são consultados no servidor ao selecionar. O cliente carrega até 1.000 lotes do produto, em vez de carregar todos os lotes da clínica ao abrir a página. Produtos com controle ativo ou em preparação exigem lote no servidor, mesmo que um cliente altere os campos do formulário.
- A página de consulta de lotes e a página individual reutilizam o mesmo componente de movimentação; os formulários antigos duplicados de entrada e saída foram removidos. Rastreabilidade, bloqueios e acompanhamento de recolhimento continuam nos detalhes do lote, acessíveis a partir da opção dentro da movimentação.
- O diálogo usa foco e Escape nativos. Trocar entre as opções internas preserva os campos do formulário. Notas de entrada por lote, transferência e retirada são preservadas no histórico.
- Não há alteração de schema nem nova migração nesta unificação. Testes PostgreSQL incluem as quatro operações comuns e por lote, identificação sem aumento de saldo, vencidos, lote incompatível, motivo e autorização.
- Conferência no navegador sem registros reais: abertura do diálogo, consulta de saldo, campos condicionais, identificação de saldo existente e ativação bloqueada enquanto a distribuição está incompleta.
- [Movimentação com lotes integrada](./qa-visual-2026-10-19/movimentacao-lotes.png).
