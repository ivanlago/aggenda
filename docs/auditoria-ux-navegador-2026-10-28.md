# Auditoria de consistência do Aggenda

Data: 28/10/2026. Ambiente: aplicação publicada, sessão autenticada no Chrome, perfil administrativo, viewport de 1536 × 695. Inspeção de interface, navegação, formulários, estados e geometria do DOM; consulta pontual ao código para esclarecer dois limites de interface. Nenhum cadastro, configuração, cobrança, pagamento ou documento foi salvo ou emitido.

## Resultado

A padronização de produtos, procedimentos, referências financeiras, cobranças e pacotes já aparece na aplicação. Entretanto, ela ainda não cobre todo o sistema e uma regra global de CSS compromete a largura até das janelas que usam o componente compartilhado.

Os problemas mais relevantes são de consistência entre telas: saldo físico versus disponível, horários, formas de receber, situação de conexões e escopo de indicadores. Não houve teste de transação; diferenças de apresentação não demonstram, por si, erro nos lançamentos financeiros ou ausência de validação no servidor.

Prioridades: **Alta** = pode induzir decisão operacional equivocada; **Média** = dificulta o fluxo ou a compreensão; **Baixa** = acabamento ou melhoria de navegação. Os achados abaixo são observações confirmadas; quando a consequência depende de uso ou crescimento, isso está explicitado.

## Achados e recomendações

### 1. Saldo mostrado no PDV não distingue o indisponível — Alta

**Onde:** Estoque → Estoque Venda; Venda e orçamento; Atendimento → Financeiro.

**Evidência:** o estoque mostrou um produto com 61 de saldo físico e 41 disponíveis e outro com 83 físicos e 43 disponíveis. O catálogo da venda mostrou, respectivamente, “61 em estoque” e “83 em estoque”. A área de lotes identifica saldos vencidos, em quarentena e recolhidos.

**Impacto:** o operador pode prometer uma quantidade que não está disponível para vender. Não foi tentada venda desses saldos, portanto não se afirma que o sistema permita consumi-los.

**Recomendação:** mostrar “41 disponíveis”, por exemplo, e explicar o saldo bloqueado separadamente; usar a mesma definição de disponibilidade em estoque, venda e atendimento.

### 2. Horários da mesma venda diferem entre módulos — Alta

**Onde:** Histórico detalhado de vendas × Estoque → Entradas/Saídas × Contas e fluxo de caixa.

**Evidência:** uma mesma venda manual aparece no histórico em 27/10 às 00:50 e nas movimentações de estoque em 26/10 às 21:50. Outra aparece em 27/10 às 03:01 no histórico e às 00:01 nas movimentações. A primeira está no financeiro com vencimento e baixa em 26/10.

**Impacto:** dificulta conferência diária e pode fazer o operador procurar uma venda no dia errado. A diferença observada é de três horas; a causa e o efeito sobre filtros e fechamento precisam de verificação técnica.

**Recomendação:** aplicar o fuso da empresa em todas as apresentações e filtros e verificar vendas próximas à meia-noite.

### 3. Janelas compartilhadas perdem a largura máxima — Alta

**Onde:** confirmado visualmente em Novo agendamento e Editar produto; afeta a base compartilhada dos formulários.

**Evidência:** ambos mediram 1504 px de largura numa tela de 1536 px. O agendamento organiza praticamente tudo numa coluna muito larga. A edição do produto tem duas colunas, mas continua excessivamente espalhada e exige rolagem para chegar às ações.

**Verificação complementar:** `ModalShell` define larguras máximas distintas, mas a regra `.internal-app .panel { max-width: 100%; }`, em `src/app/globals.css`, também se aplica ao diálogo e se sobrepõe ao limite pretendido.

**Recomendação:** corrigir primeiro a regra compartilhada, preservar os limites de cada tamanho de janela e depois ajustar a grade do agendamento. Isso evita refazer cada formulário individualmente.

### 4. Recebimento varia conforme a porta de entrada — Alta

**Onde:** Agenda → Registrar pagamento; Atendimento → Financeiro; Venda e orçamento; Contas → baixa manual.

**Evidência:** a venda avulsa oferece recebimento pelo Mercado Pago; a venda dentro do atendimento oferece somente recebimento manual/maquininha externa. A agenda tem outro formulário de pagamento, com saldo de pacote e meios manuais. A baixa manual da conta oferece situação e data da baixa, sem os mesmos detalhes do checkout.

**Impacto:** o usuário precisa saber em qual tela a operação desejada está disponível. Não se constatou duplicidade de lançamento, pois nenhum pagamento foi registrado.

**Recomendação:** manter atalhos contextuais, mas usar um fluxo de recebimento comum, com origem e vínculo explícitos. Quando um provedor não puder ser usado no atendimento, informar o motivo e oferecer o encaminhamento correto.

### 5. Edição do agendamento tem três escopos de salvar — Média

**Onde:** Agenda → Editar agendamento.

**Evidência:** a mesma janela reúne “Salvar sala”, “Salvar situação do agendamento” e reagendamento; a sala aparece também no reagendamento. Situação, data e horário têm problemas de identificação acessível em parte dos controles.

**Recomendação:** reunir alterações relacionadas em uma edição com resumo e uma confirmação, ou separar claramente “Alterar situação”, “Trocar sala” e “Reagendar” em ações próprias. Eliminar a duplicação do campo sala no mesmo contexto.

### 6. WhatsApp e IA apresenta sinais contraditórios — Alta

**Onde:** Configurações → WhatsApp e IA.

**Evidência:** a tela combina “Configuração pendente/incompleta”, indicador de um canal ativo e bloco “Canal conectado” com canais apresentados como pendentes. Não há uma próxima ação direta proporcional ao bloqueio informado.

**Recomendação:** distinguir canal cadastrado, conectado, ativo e apto ao processamento; calcular o resumo a partir desses estados e oferecer uma ação para resolver cada pendência.

### 7. Plano contratado não fica claro entre administração e contratação — Média

**Onde:** Assinaturas; Administração SaaS → Empresas → detalhe.

**Evidência:** a lista administrativa mostra `essential`; o detalhe apresenta “Core + Aggenda Secretária”; a página de assinatura abre uma escolha de contratação sem um resumo inequívoco do contrato atual. Há nomenclaturas de gerações diferentes.

**Recomendação:** exibir plano e serviços atuais, vigência e situação antes do formulário; identificar claramente nova contratação ou alteração e unificar nomes comerciais. Não foi concluída contratação nem comparada a cobrança efetiva.

### 8. Criação e edição ainda usam padrões diferentes — Média

**Onde:** Clientes, Equipe, Salas, Voucher, Nova oportunidade e modelos de documentos.

**Evidência:** produto/procedimento/pacote usam janela com seções e Cancelar/Salvar; cliente novo expande na página e a edição fica dentro da ficha; equipe combina cadastro fixo, edição dentro do cartão e disponibilidade em janela; voucher e oportunidade abrem na página; salas usam janela sem o mesmo rodapé.

**Recomendação:** aplicar o padrão compartilhado aos cadastros curtos e médios. Manter páginas próprias para prontuário e configurações extensas, com seções e ações consistentes. A diferença de contexto pode justificar uma página, mas não rótulos, ações e comportamento arbitrariamente diferentes.

### 9. Fechamento e cancelamento inconsistentes — Média

**Onde:** disponibilidade da equipe, Salas, Bloquear horário, Registrar pagamento e quitação de comissão.

**Evidência:** várias janelas têm apenas a ação de salvar e o X. Na disponibilidade, o botão de fechar não possui nome acessível.

**Recomendação:** rodapé previsível com Cancelar e ação principal; nome acessível em todos os ícones; política comum para alterações não salvas. A proteção contra perda de alterações não foi provocada com dados reais.

### 10. Campos dependem de placeholder ou não têm nome acessível — Média

**Onde:** provedores de pagamento, estoque, nova oportunidade, configurações do CRM, documentos genéricos, edição de modelos, fechamento de caixa, OFX e relatórios do PDV.

**Evidência:** seletores de ambiente, origem/responsável e tipos aparecem sem nome; alguns formulários usam somente o texto dentro do campo. Na edição de modelo, os três campos preenchidos ficam sem rótulo que identifique sua função. O arquivo de OFX aparece como “Choose File”.

**Recomendação:** rótulos persistentes associados aos controles, instruções curtas e identificação específica de campos repetidos. Não basta um placeholder para reconhecer um campo já preenchido.

### 11. Falta orientação quando não existe conta financeira — Média

**Onde:** Fechamento de caixa e Conciliação OFX.

**Evidência:** o seletor está vazio, porém “Abrir caixa” e “Importar OFX” continuam visíveis sem um caminho direto para cadastrar a conta. Em contraste, a quitação de comissão explica que é necessário cadastrar uma conta ativa e impede a confirmação.

**Recomendação:** adotar o mesmo estado vazio orientado: explicar a dependência, oferecer “Cadastrar conta” e habilitar a operação quando houver condições.

### 12. Atalhos não preservam o contexto — Média

**Onde:** Dashboard, Implantação guiada, Recuperação de pacientes e guias de pagamento.

**Evidência:** “A receber hoje”, “A pagar hoje” e os dois indicadores de vencidos abrem todos `/financeiro`, sem filtro correspondente. Atalhos para revisar agendamento, WhatsApp e prazo de recuperação abrem configurações sem selecionar a seção. Os guias dizem “Voltar … em Cobranças”, mas voltam às configurações do provedor.

**Recomendação:** transmitir período, tipo, situação e aba; nomear o destino real do retorno.

### 13. Indicadores da mesma página têm escopos temporais distintos — Média

**Onde:** DRE e indicadores.

**Evidência:** a competência é mensal, mas “Inadimplência por cliente” reúne pendências desde agosto mesmo com outubro selecionado. A descrição informa que são contas vencidas, mas não esclarece que esse bloco ignora a competência.

**Recomendação:** indicar “saldo vencido acumulado até…” ou aplicar o período. O acumulado pode ser útil; o problema é o escopo implícito.

### 14. Documento, modelo e emissão competem na mesma navegação — Média

**Onde:** Documentos → Clínicos, Jurídicos e Criar documentos.

**Evidência:** Jurídicos e Criar documentos oferecem criação de modelo e gestão de parte da mesma biblioteca. Clínicos tem ferramentas específicas, enquanto Criar documentos também emite documentos profissionais. A declaração de acompanhante aparece como ferramenta específica e como modelo genérico.

**Recomendação:** separar “Emitir documento”, “Modelos” e “Histórico”, mantendo as ferramentas clínicas por tipo dentro da emissão. Centralizar a manutenção dos modelos e apontar para ela nos demais lugares.

### 15. Dois conceitos de orçamento sem ligação evidente — Média

**Onde:** Venda e orçamento × Documentos jurídicos → Orçamento e plano de tratamento × CRM → Propostas comerciais.

**Evidência:** a venda monta orçamento com catálogo, itens e conversão; o documento jurídico pede sessões, valor e condições novamente; o CRM mantém propostas próprias. A interface não explica uma relação entre esses objetos.

**Recomendação:** definir o orçamento comercial como origem dos valores e itens, permitindo gerar o plano/documento e acompanhar a proposta vinculada. Se forem objetos independentes por intenção, explicar suas finalidades e evitar redigitação. Não se afirma duplicação de receita.

### 16. Documento histórico tem paginação, mas ainda cresce demais por página — Média

**Onde:** Documentos → Histórico.

**Evidência:** 35 cartões produziram cerca de 2707 px de lista e 3325 px de página, sem limite de altura no contêiner. A consulta ao código confirmou paginação de 50 registros: portanto, não é uma lista ilimitada.

**Recomendação:** reduzir a quantidade padrão, mostrar total/faixa e adotar a área de resultados limitada usada nas outras listas. Evitar chamar o problema de ausência de paginação.

### 17. Identidade dos profissionais repete formulários sem limite visual — Média

**Onde:** Assinatura do profissional → Identidade dos profissionais.

**Evidência:** cada profissional recebe um formulário completo de CPF, confirmação e ação, todos empilhados. Com cinco profissionais, a página já mede aproximadamente 1769 px; o contêiner não tem paginação ou altura máxima. A repetição sem contenção também foi confirmada no código.

**Recomendação:** lista pesquisável com situação da identidade e ação “Conferir identidade” por pessoa, abrindo somente um formulário por vez. O crescimento além da base atual é um risco inferido da estrutura observada.

### 18. Auditoria expõe eventos técnicos com pouca tradução — Média

**Onde:** Administração → Auditoria.

**Evidência:** nomes como `pos_payment:completed`, `retail_sale` e `commission_entries`, acompanhados de identificadores, exigem conhecimento técnico. A paginação funciona, mas faltam busca/filtros visíveis e acesso contextual ao registro.

**Recomendação:** frases de negócio com autor, ação, objeto, resultado e data; manter o evento técnico em detalhes; oferecer filtros e link para o registro quando permitido.

### 19. Códigos internos aparecem em vendas e administração — Baixa

**Onde:** Histórico e relatórios de vendas; provedores; Administração SaaS.

**Evidência:** `credit_card`, `debit_card`, `mercado_pago`, `webhook configured`, `trialing`, `owner`, `receptionist` e `professional` aparecem diretamente.

**Recomendação:** mapa central de apresentação em português; manter códigos apenas em informações técnicas expansíveis. Padronizar também Pix/PIX, Dinheiro/Espécie e Serviços/Procedimentos conforme a terminologia da empresa.

### 20. Provedores integrados e conciliação manual ocupam a mesma hierarquia — Baixa

**Onde:** Configurações → Provedores de pagamento.

**Evidência:** nove abas misturam quatro integrações de cobrança com cinco orientações semelhantes de conciliação OFX. Os textos explicam a distinção, mas ela só fica clara ao abrir a aba. Opções avançadas exibem desconexão de Mercado Pago mesmo quando outra instituição está selecionada.

**Recomendação:** separar “Recebimento integrado” e “Conciliação de maquininha/extrato”, manter guias por instituição e aproximar a desconexão da conta correspondente.

### 21. Preparação fiscal pede contexto repetido — Média

**Onde:** Emissão de NFS-e.

**Evidência:** “Preparação fiscal” pede município e regime, enquanto “Como deseja trabalhar…” pede município e perfil fiscal novamente. Há textos com escopos regionais diferentes: a preparação inclui três municípios e outro trecho fala em escopo inicial de dois.

**Recomendação:** apresentar dados da empresa uma vez, distinguir claramente dados salvos de simulação de requisitos e usar uma única informação sobre cobertura. O título solicitado anteriormente, “Preparação fiscal”, já está correto.

### 22. Ficha do cliente repete os mesmos documentos em blocos diferentes — Baixa

**Onde:** Cliente → Documentos emitidos e Histórico do cliente; Atendimento → Documentos do cliente.

**Evidência:** documentos aparecem em mais de uma coleção, com variações de ação (“Criar nova receita…”, “Criar nova a partir desta”, “Abrir PDF”). A ficha ainda apresenta agendamentos e linha do tempo em seções separadas, exigindo distinguir registros de eventos.

**Recomendação:** uma coleção de documentos com filtros e ações comuns; usar a linha do tempo para eventos com links para os objetos. Evitar duplicar controles quando a repetição não acrescentar contexto.

### 23. Administração SaaS tem atalhos pouco específicos — Baixa

**Onde:** painel da Administração SaaS.

**Evidência:** cartões “Clientes finais” e “Serviços” levam à lista de empresas, sem selecionar ou explicar onde consultar esses dados. Nas tabelas administrativas não há busca visível; as áreas têm limite de rolagem de 640 px, portanto não são listas sem contenção.

**Recomendação:** levar ao relatório correspondente ou indicar que a consulta é por empresa; incluir busca quando o volume crescer.

### 24. Ferramentas internas saem da navegação principal sem retorno claro — Baixa

**Onde:** calculadoras de procedimento e produto; Assinaturas.

**Evidência:** as calculadoras abrem como ferramentas públicas, sem o menu e sem um retorno explícito ao cadastro de origem. Assinaturas usa outra estrutura de navegação e retorna por um link genérico.

**Recomendação:** preservar um retorno ao contexto de origem quando acessadas de dentro do sistema. A calculadora pode continuar pública quando acessada diretamente.

## O que já está consistente e não deve ser retrabalhado sem necessidade

- Pacotes separa modelos e pacotes dos clientes; novas vendas vão para Venda e orçamento. “Registrar pacote anterior” explica que não gera receita. Não há mais um PDV independente nessa página.
- Novo produto, novo procedimento, novo lançamento, nova cobrança e pacote usam seções e rodapé com Cancelar/Salvar. Corrigir a largura compartilhada antes de redesenhá-los.
- Cobranças explica sua relação com contas a receber; contas vinculadas orientam o operador ao provedor ou à venda, em vez de oferecer baixa manual indiscriminada.
- A existência de um checkout contextual no atendimento pode ser útil. O problema observado é a diferença de capacidades e de linguagem, não a mera existência do atalho.
- A repetição do procedimento principal no catálogo do atendimento usa o rótulo “Procedimento realizado”. Na confirmação final, não apareceu também uma segunda opção genérica desse mesmo procedimento no modo Venda; portanto não foi classificado como item duplicado no catálogo.
- Estoque, agenda, procedimentos, pacotes, referências, equipe, salas, importações, comissões, históricos do cliente e tabelas administrativas têm paginação, área limitada ou limite explícito de registros nos estados examinados. Não há evidência para chamá-los indiscriminadamente de listas ilimitadas.
- `/disponibilidade` encaminha para Equipe e acesso; não foi considerado um segundo cadastro independente de disponibilidade.

## Cobertura e limites

Foram visitadas **50 rotas distintas**, incluindo nove guias de instituições, e registrados mais de **140 estados** de interface. Essa contagem inclui formulários abertos e mudanças de abas; não significa 140 funcionalidades independentes.

| Área | Estados examinados |
|---|---|
| Dashboard | Indicadores, resumo financeiro, agenda e ações rápidas |
| Agenda | Dia/semana/mês; novo, editar, bloquear horário e registrar pagamento |
| Atendimento | Visão geral, Consulta, Fotos e exames, Documentos, Financeiro; resumo clínico, laudo, adição de itens; Venda e Orçamento |
| Clientes | Lista, novo, complementares, ficha, editar; fotografias, documentos, pacotes, histórico, agendamentos e linha do tempo |
| CRM | Seis abas; novo voucher, painel de envio, nova oportunidade e configurações de campos |
| Estoque | Quatro abas, novo/editar produto, categorias, movimentação, detalhe do lote, bloqueio e recolhimento |
| Procedimentos | Lista, novo e editar; classificação e referência de categoria |
| Pacotes | Modelos, clientes, novo/editar e registro anterior |
| Venda e orçamento | Venda, Orçamento, seletor de cliente, históricos, relatórios e acompanhamento de pagamento concluído |
| Financeiro | Contas, novo lançamento, referências e baixa manual; cobranças e nova cobrança; comissões, regras e quitação; fechamento, OFX, DRE e NFS-e com registro externo |
| Documentos | Cinco ferramentas clínicas, criação de anamnese, inclusão de medicamento/exame; nove modelos jurídicos; criação/edição de modelos, histórico e assinatura profissional |
| Administração | Implantação, importação de clientes/serviços, equipe/edição/disponibilidade, auditoria e assinatura |
| Configurações | Dez abas; salas nova/edição; nove instituições, validação Asaas e opções avançadas |
| SaaS | Painel, empresas, usuários, detalhe de empresa e convites do piloto |
| Apoio e portal | Duas calculadoras; nove guias; entrada do portal e primeiro acesso |

**Limites da inspeção:** foi usada uma sessão administrativa e uma amostra de registros para cada tipo de tela, não cada registro individual. A consulta clínica do atendimento exige o usuário do profissional responsável; não se alterou acesso para abri-la. O portal autenticado do cliente exige código por e-mail; apenas a entrada foi examinada. Não foram executados envios, uploads, emissão/assinatura de documentos, conexão/teste de provedores, alterações, pagamentos ou confirmações destrutivas. Pop-ups e estados posteriores que dependem dessas operações permanecem não verificados. Fotografias e laudos estavam sem registros na amostra; comparação de fotos e revisão de anexos existentes não foram exercitadas. A inspeção visual foi de desktop; não constitui homologação de celular, Edge ou leitores de tela.

## Sequência recomendada de trabalho

1. Corrigir a largura dos diálogos, saldo disponível no catálogo e apresentação de data/hora. São problemas transversais e devem vir antes do acabamento individual.
2. Unificar recebimento contextual, edição de agendamento e estados de conexão/contratação.
3. Estender rótulos e ações comuns aos cadastros restantes, com atenção a Equipe, Cliente, CRM, Salas e Documentos.
4. Consolidar biblioteca de documentos e explicitar a relação entre orçamento, proposta e documento jurídico.
5. Reduzir o histórico de documentos por página, conter a lista de identidades e melhorar atalhos, filtros e traduções.
6. Após as correções, homologar em desktop e celular e executar os fluxos completos em ambiente de teste, com perfis de recepção e profissional e sem movimentação financeira real.
