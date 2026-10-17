# Conferência visual — 17/10/2026

## Escopo e condições

Inspeção no navegador lateral autenticado como administrador, em localhost. A área útil observada tinha 744 px de largura (captura incluindo a barra lateral: aproximadamente 759 px). As conclusões de responsividade abaixo se referem a essa largura; não houve simulação de celular nem validação em monitor largo.

Foram visitados Dashboard, Fluxo de caixa, NFS-e, Agenda, Clientes, um prontuário existente, Documentos clínicos e Configurações/Identidade. Apenas navegação, expansão de painéis e inspeção de formulários: nenhum cadastro, lançamento, bloqueio, agendamento, documento, certificado ou revisão clínica foi salvo. Nenhuma página externa de agendamento foi aberta ou alterada. Os arquivos de implementação não foram modificados nesta conferência.

## Achados por prioridade

| Prioridade | Evidência observada | Consequência | Ajuste indicado |
|---|---|---|---|
| Alta | Ao expandir Atendimento na navegação horizontal, o controle fica expandido, mas as opções abaixo são recortadas. Os links continuam no DOM, sem aparecer no painel. | O usuário não consegue descobrir ou acessar visualmente partes da aplicação nessa largura. | Renderizar os submenus fora do contêiner que rola horizontalmente ou usar menu recolhível nessa faixa de largura. Conferir também Financeiro e Administração após a correção compartilhada. |
| Alta | Na Agenda, `document.documentElement.scrollWidth` foi 974 px para `clientWidth` de 744 px. A barra horizontal aparece na página inteira. | Controles e conteúdo saem da área útil. | Conter a tabela em uma região de rolagem própria e permitir encolhimento dos contêineres de grade/flex. |
| Média | O atalho Nova Conta a pagar abriu corretamente o formulário, mas o vencimento veio como 01/10/2026 no dia 17/10/2026. | Um lançamento novo pode ser criado vencido por descuido. | Rever a data padrão do cadastro rápido; usar a data atual da clínica ou exigir escolha explícita, distinguindo-a do período do relatório. |
| Média | Na chegada ao formulário financeiro pela âncora, o cabeçalho fixo cobre o começo do painel. Na largura observada, a segunda faixa de ações ocupa cerca de 125 px durante a rolagem. | O título e o contexto da ação ficam escondidos; sobra pouca área para trabalhar. | Ajustar o deslocamento das âncoras e reduzir/reorganizar a barra de ações nessa largura. |
| Média | Descrição e valor do lançamento financeiro têm placeholder, mas não têm rótulo permanente associado. Os filtros da agenda também dependem do texto da opção selecionada. | O significado do campo desaparece ao preencher e prejudica a navegação assistiva. | Adicionar rótulos visíveis e associados, unidades e indicação consistente dos campos obrigatórios. |
| Média | No prontuário, a seção de agendamentos anteriores mostra data, procedimento e situação, sem link para abrir o atendimento. A Agenda mostra apenas próximos atendimentos e estava vazia. `/agendamentos` redirecionou para essa mesma Agenda. | Não foi possível chegar às novas abas da consulta pelo percurso disponível para um atendimento antigo. | Oferecer Abrir atendimento em cada item do histórico e acesso a períodos anteriores na agenda. |
| Média | NFS-e informa que a custódia precisa ser configurada antes de cadastrar certificados, mas Conferir certificado e salvar permanece habilitado (`isEnabled() === true`). | A tela convida o usuário a uma ação que ela própria declara indisponível. | Explicitar o pré-requisito junto à ação e impedir o envio enquanto faltar configuração. O envio não foi testado; não se conclui daqui que há falha de autorização no servidor. |
| Baixa | O modal Novo Agendamento repete o título na moldura e no formulário interno. O seletor de horário já informa Nenhum horário disponível antes da escolha de profissional, procedimento e data. | Ocupa espaço e confunde falta de preenchimento com indisponibilidade real. | Exibir um único título e orientar primeiro quais dados precisam ser selecionados. |
| Baixa | O cadastro inicial de cliente exibe de uma vez dados de contato, endereço, documentos, medidas e outros campos opcionais. | A primeira inclusão parece mais trabalhosa para uma operação pequena. | Priorizar os campos essenciais e agrupar informações complementares sem remover dados existentes. |

## O que foi confirmado

- Ações rápidas está acima de Aniversariantes, com os três atalhos solicitados.
- Nova Conta a pagar abre o formulário expandido e com Conta a pagar selecionada.
- O modal de bloqueio mostra profissional, início, fim e motivo, com orientação sobre horário local. Não foi salvo.
- Os modais de bloqueio e novo agendamento receberam foco ao abrir e fecharam por Escape, devolvendo foco aos botões de origem. Uma passagem por Shift+Tab permaneceu no diálogo; não equivale a uma auditoria completa de teclado.
- O cadastro de cliente abriu com os campos identificados e fechou sem salvar.
- O prontuário carregou resumo clínico, anexos, registros finalizados e painéis de histórico. A indicação Alergias não verificadas distingue falta de revisão de ausência de alergias.
- Receituário e Solicitação de Exames abriram com seleção de paciente/emissor e listas inicialmente vazias. A inclusão de medicamento apresenta rótulos para busca, medicamento, apresentação e posologia. Nenhum conteúdo foi inserido e nenhum documento foi emitido.
- A aba Identidade mostrou Instagram, Facebook, TikTok, X, YouTube, LinkedIn, Threads e Pinterest, com rótulos visíveis. O conteúdo externo desses atalhos não foi visitado.
- A consulta aos erros de console nas telas visitadas não retornou erros. Houve aviso de desenvolvimento sobre `scroll-behavior: smooth` e indicação de compilação/renderização local; isso não mede desempenho de produção.

## Limites e pendências

Na primeira rodada não havia atendimento futuro acessível. Em seguida, o usuário criou um agendamento e foi possível abrir Atender pela agenda e conferir as cinco abas. O editor, o comportamento visual de rascunho e a finalização continuam pendentes de inspeção com o usuário vinculado ao profissional responsável: a sessão de administrador usada nesta conferência recebeu a orientação de entrar com esse profissional. Nenhum registro clínico foi preenchido ou finalizado.

Também não foram testados envio de formulários, confirmação de alterações não salvas, emissão ou assinatura, pagamentos, autorização fiscal, usuário profissional/recepção, contraste calculado, todos os tamanhos de tela ou navegação completa por leitor de tela. Os testes automatizados anteriores continuam sendo evidência distinta desta inspeção visual.

As capturas abaixo foram feitas apenas de cabeçalhos e formulários vazios; não foram persistidas capturas com dados clínicos ou identificadores de pacientes.

## Evidências

- [Menu Atendimento expandido e recortado](./qa-visual-2026-10-17/menu-atendimento-recortado.png)
- [Agenda com rolagem horizontal da página](./qa-visual-2026-10-17/agenda-overflow.png)
- [Formulário financeiro: campos e data padrão](./qa-visual-2026-10-17/financeiro-campos.png)
- [Modal de bloqueio](./qa-visual-2026-10-17/bloqueio-modal.png)
- [Modal de novo agendamento](./qa-visual-2026-10-17/novo-agendamento.png)
- [Cadastro inicial de cliente](./qa-visual-2026-10-17/cadastro-cliente.png)
- [Campos do receituário](./qa-visual-2026-10-17/receituario-formulario.png)


## Complemento: atendimento criado pelo usuário

Após o usuário informar que criou um agendamento, foi aberto o link Atender da única linha futura exibida na agenda. O atendimento carregou, com largura de página igual à largura útil (744 px) nessa tela.

- As cinco abas renderizaram: Visão geral, Consulta, Fotos e exames, Documentos e Financeiro. A troca por clique funcionou; ArrowRight selecionou a aba seguinte e Home voltou à Visão geral. Apenas um painel ficou visível por vez.
- Consulta exibiu a orientação de entrar com o usuário vinculado ao profissional responsável para finalizar a evolução. O editor não foi mostrado a esse administrador, e não se testou edição, recuperação de rascunho ou finalização nessa sessão.
- Fotos e exames apresentou o atalho para fotos no prontuário e a seção de PDFs, com estado vazio e opção de anexar. Não houve navegação para fotos, upload ou alteração de dados.
- Documentos mostrou as informações anteriores, a ferramenta de declaração de acompanhamento e a lista de documentos. O formulário de declaração abriu sem preenchimento ou envio. Um detalhe de redação no texto de prévia merece ajuste: “na esta clínica”. A emissão, autoria efetiva e autorização no servidor não foram testadas.
- Financeiro mostrou o procedimento principal, o catálogo/carrinho e a área de orçamento. Não houve inclusão/remoção de item, pagamento ou emissão.
- Encerramento distinguiu agendamento Agendado, registro clínico Ainda não finalizado e Sem rascunhos pendentes, com referência à aba Financeiro. Não foi alterado o status.

**Novo achado de prioridade alta:** durante a rolagem, a barra de abas fixa passou a ter `top = 0` e altura aproximada de 54 px, sobrepondo-se à barra global de busca/ações, em vez de ocupar uma posição abaixo dela. Conferir o deslocamento e a hierarquia de camadas das duas barras; em área estreita, avaliar manter apenas uma delas fixa. A evidência é a [sobreposição das abas](./qa-visual-2026-10-17/atendimento-abas-sobrepostas.png).

[Consulta na sessão de administrador](./qa-visual-2026-10-17/consulta-administrador.png) registra a orientação de vínculo profissional, sem nome ou identificador do paciente na captura.

## Ajustes implementados após autorização

- Navegação interna expansível em telas estreitas; submenus em fluxo normal, sem recorte. O cabeçalho global deixa de ser fixo e as abas do atendimento mantêm sua própria posição durante a rolagem.
- Agenda com data inicial e períodos anteriores, limites calculados no fuso da clínica e tabela com rolagem própria. Rótulos permanentes nos filtros.
- Histórico de agendamentos do cliente com atalho Abrir atendimento, preservando a autorização da página de destino.
- Novo agendamento com um único título, campos identificados e orientação para selecionar procedimento, profissional e data antes de consultar horários.
- Cadastro inicial do cliente concentrado em nome, telefone e e-mail; demais campos continuam disponíveis em Informações complementares.
- Lançamento financeiro com rótulos permanentes e vencimento na data atual da clínica, independente do mês do relatório.
- Cadastro de A1 bloqueado enquanto falta configurar a custódia fiscal, com mensagem explicativa e proteção correspondente na ação do servidor.
- Prévia da declaração de acompanhamento corrigida para “nesta clínica”.
- Funções de data compartilhadas isoladas em módulo sem dependências de banco, para uso seguro no formulário cliente.

Conferência após as mudanças: submenu Atendimento visível; agenda com largura útil e largura de documento iguais (744 px), tabela em região rolável; filtro de data anterior retornou os atendimentos daquele período; modal com um único título; vencimento em 17/10/2026; botão fiscal desabilitado; campos opcionais do cadastro recolhidos e presentes ao expandir; atalhos de atendimento presentes no histórico; cabeçalho global fora da área visível durante rolagem da consulta, sem cobrir as abas. Não houve envio de formulários ou alteração de registros.

Validação automatizada: 14 testes clínicos, 13 testes fiscais e teste de limites da agenda passaram; ESLint dos arquivos alterados sem erros. As funções de data reutilizam a conversão existente, com teste adicional de fim de mês, data inválida e horário de verão.

Não há alteração de schema ou nova migration. O agendamento externo não foi alterado. A inspeção do editor com usuário profissional, emissão fiscal e assinaturas reais continuam pendentes conforme os limites acima.

Evidências corrigidas: [novo agendamento](./qa-visual-2026-10-17/novo-agendamento-corrigido.png) e [abas sem sobreposição](./qa-visual-2026-10-17/atendimento-abas-corrigidas.png).

Compilação de produção concluída com sucesso, incluindo TypeScript e geração das páginas.
