# Correções da auditoria de consistência

Referência: `docs/auditoria-ux-navegador-2026-10-28.md`.

As alterações foram feitas no código local, sem publicação, migração ou alteração de dados da aplicação. A tabela registra a solução adotada para cada achado. Nem toda diferença entre fluxos exigia fundir operações: nos casos indicados, a correção foi explicitar finalidade, restrição e destino.

| # | Tratamento |
|---|---|
| 1 | Venda e atendimento usam `getPosProducts`, a mesma consulta de disponibilidade por lote. O catálogo informa quantidade disponível para venda. Itens sem saldo ficam desabilitados e o leitor de código de barras também impede a inclusão, com mensagem correta. |
| 2 | Histórico de vendas, lista resumida, estoque e auditoria usam o fuso da empresa. O relatório de vendas calcula início e fim do mês no fuso local, inclusive a transição de dia. |
| 3 | A regra global de largura deixa de sobrescrever diálogos. Agendamento ganhou duas colunas em desktop e uma em celular; rótulos não esticam os campos para acompanhar textareas. |
| 4 | Mantida a restrição do servidor para checkout integrado no atendimento. A interface explica o vínculo e oferece cobrança online da conta a receber quando há pagamento pendente e permissão. A agenda encaminha diretamente à aba Financeiro do atendimento. Produtos e pacotes avulsos integrados continuam na venda. Não foi liberada uma segunda forma de cobrar o mesmo atendimento. |
| 5 | Editar agendamento separa tarefas em seções explícitas: trocar sala sem reagendar, alterar situação e reagendar data/horário/sala. Cada ação informa seu escopo; data, horário e situação têm rótulos. |
| 6 | WhatsApp conta somente canais conectados e ativos; a lista se chama Canais cadastrados e distingue pendentes, ativos e desativados. Canais pendentes existentes também recebem orientação de reconexão; processamento/modelos pendentes têm orientação de suporte. |
| 7 | Assinaturas mostra contratação, vigência e situação antes das opções de compra. A nova contratação é identificada. Administração consulta o contrato comercial na lista de empresas e distingue os módulos operacionais e configurações legadas. Nenhum contrato foi alterado. |
| 8 | Cliente novo/edição, Equipe novo/edição/disponibilidade, Voucher, oportunidade, modelos e movimentação de estoque adotam a janela compartilhada. Prontuário e configurações extensas continuam em páginas próprias. |
| 9 | Rodapés Cancelar/ação principal em salas, agendamento, bloqueio, recebimento, comissão e cadastros migrados. Disponibilidade e movimentação de estoque passam a usar a janela comum, com foco, Escape, fechar nomeado e proteção de alterações não salvas no formulário. |
| 10 | Rótulos persistentes em credenciais/ambiente, oportunidades, CRM, modelos, documentos profissionais, caixa, OFX, relatório de vendas e cadastro do cliente. Busca e filtros de estoque têm identificação acessível. A seleção de OFX usa controle com texto em português. |
| 11 | Caixa e OFX explicam a falta de conta ativa, impedem confirmação sem essa dependência e levam ao gerenciador de contas financeiras já aberto. |
| 12 | Dashboard envia tipo, situação, competência e vencimento do dia. Implantação abre Identidade, Agendamento e WhatsApp nas abas corretas; recuperação abre Lembretes. Guias nomeiam o destino real de retorno. |
| 13 | DRE identifica inadimplência como acumulada de todas as competências até hoje, distinguindo-a do relatório mensal. |
| 14 | Navegação comum de documentos separa emissão clínica, jurídica, outros documentos, modelos e histórico. A manutenção genérica de modelos fica na biblioteca; Jurídicos aponta para ela. A declaração nativa usa a ferramenta clínica, preservando a emissão dos modelos personalizados. O editor estruturado de anamnese continua especializado. |
| 15 | Orçamento comercial, proposta de lead e plano jurídico têm finalidades explícitas e encaminhamento para o orçamento comercial. O atalho abre o modo Orçamento. Continuam objetos independentes: aceitar proposta ou assinar plano não registra venda ou pagamento. Não houve migração nem vinculação automática de objetos antigos. |
| 16 | Histórico de documentos reduzido de 50 para 20 por página, com faixa de registros e área de rolagem limitada. Filtros são preservados. |
| 17 | Identidades dos profissionais têm busca, paginação, área limitada e formulário individual em janela. Não há mais um formulário completo permanentemente aberto para cada pessoa. |
| 18 | Auditoria apresenta ação e objeto em linguagem de negócio, filtros por ação/tipo e busca por evento/identificador. Eventos técnicos permanecem em detalhes. Há links para cliente, atendimento e venda quando o identificador é válido; o destino mantém sua própria autorização. |
| 19 | Meios de pagamento, status de assinatura e perfis recebem apresentação em português. Dinheiro/Pix padronizados no recebimento. Estado de avisos de pagamento substitui o texto técnico em inglês. |
| 20 | Provedores separados em Recebimento integrado e Conciliação de maquininha/extrato. Desconexão fica dentro da conta correspondente. Guias por instituição foram preservados. |
| 21 | Preparação fiscal é identificada como cadastro salvo; o painel seguinte é explicitamente uma simulação de requisitos, sem gravar a empresa. O escopo preparatório cita os mesmos três municípios, sem prometer homologação. |
| 22 | Documentos do cliente e do atendimento usam a mesma coleção, ações e limite de exibição. O histórico livre deixa de repetir documentos eletrônicos já reunidos na coleção e orienta onde encontrá-los. Registros existentes não foram apagados. |
| 23 | Administração oferece busca em empresas e usuários. Os cartões de clientes/procedimentos indicam que a consulta é por empresa; papéis e estados são traduzidos. |
| 24 | Calculadoras têm retorno ao cadastro correspondente; Assinaturas identifica o retorno ao Dashboard. |

## Validação

- TypeScript sem erros.
- Suíte final: **38 testes aprovados, nenhum erro e dois testes opcionais ignorados**. Cobertura de disponibilidade, lotes, reserva, pagamento, estorno, comissão, filtros, datas, paginação e formulários, usando dados fictícios ou PostgreSQL isolado.
- ESLint sem erros; permanecem dois avisos anteriores sobre navegação em telas de convite e acesso profissional pendente, fora dos arquivos desta correção.
- Novas regressões cobrem o filtro do Dashboard, a virada de dia no fuso da empresa, apresentação segura da auditoria, métodos em português, bloqueio por código de barras e separação das modalidades de pagamento.
- Prévia local no Chrome com os componentes reais e ações de gravação substituídas por bloqueios: agendamento, cliente, equipe, disponibilidade, voucher, movimentação, catálogo, modalidades de provedor e lista de identidades.
- Desktop: janela de agendamento com 1024 px, antes 1504 px no monitor de 1536 px.
- Celular simulado de 390 × 844: página com 390 px de largura; janela com aproximadamente 358 px, sem transbordamento horizontal, uma coluna e rolagem vertical. Paginação avançou de registros 1–10 para 11–20 numa coleção fictícia de 35 registros.
- Build de produção com Webpack aprovado. O comando padrão com Turbopack apresentou falha interna ao iniciar o processo de CSS neste Windows, inclusive fora do sandbox; a configuração padrão do projeto não foi alterada para contornar esse problema.

## Limites

A conferência visual foi em prévia local e dados fictícios, não uma homologação publicada com todos os perfis e estados reais. Não foram enviados e-mails/WhatsApp, emitidos documentos fiscais/clínicos, alteradas credenciais, aceitos contratos nem realizados pagamentos. Dois testes de integração opcionais dependem de banco explicitamente configurado e podem aparecer como ignorados; os testes de lotes, pagamentos e comissões em PostgreSQL isolado foram executados. A homologação dos provedores e do emissor fiscal permanece uma atividade operacional separada.
