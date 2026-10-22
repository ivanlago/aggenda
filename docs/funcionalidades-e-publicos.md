# Aggenda — funcionalidades e públicos

Inventário do código e documentação em 21/10/2026. Presença de implementação não equivale a homologação de todas as integrações externas. Não altera escopo, preços ou produção.

## Público prioritário

Profissionais autônomos e pequenas/médias equipes de estética, beleza e bem-estar, com atendimentos individuais por horário, venda de produtos ou pacotes e necessidade de gestão financeira e relacionamento. Foco atual de piloto: clínicas de estética. Configuração permite adaptar termos de cliente, profissional e serviço.

## Inventário funcional

- Empresa: identidade, logo, contatos, endereço, redes, fuso, terminologia, políticas, página pública e domínio próprio sujeito à configuração/verificação.
- Pessoas: cadastro de clientes, histórico, profissionais, registros profissionais quando aplicáveis, equipe e permissões por função; dependentes autorizados no portal.
- Agenda: agendamentos internos, disponibilidade por profissional, jornadas/intervalos/bloqueios, salas, estados do atendimento, reagendamento/cancelamento, duração, disponibilidade pública e regras de antecedência/janela/intervalo. Não presumir gestão de aulas coletivas ou equipamentos sem validar requisito específico.
- Catálogo: categorias, busca/filtro, serviços, duração/preço/custo estimado, preparo, TUSS quando pertinente, ativo/inativo, sinal e política de repetição/retorno.
- Portal: seleção de serviço/profissional/data/horário, identificação por código de e-mail, reservas e histórico, dependentes autorizados, vouchers e regras contra sobreposição/repetição. Sinal depende do provedor financeiro.
- Pacotes: composição por serviços/sessões, aquisição, saldo/consumo, validade, pagamentos e vínculo ao atendimento.
- Vendas: PDV com produtos/procedimentos/pacotes conforme fluxo, descontos autorizados, beneficiário de comissão, histórico, cancelamento/estorno e relatórios.
- Financeiro: receitas/despesas, contas, recebimentos, situação de pagamentos, caixa/fechamento, relatórios/PDF e conciliação OFX. Integrações financeiras implementadas com Asaas, Mercado Pago, PagBank e Efí exigem credenciais e homologação por operação. Registro de quitação de comissão não transfere dinheiro.
- Comissões: percentual/fixo, regras gerais/específicas, competência, rateio de pacotes por sessões, elegibilidade por conclusão/recebimento, apuração explícita, quitações, ajustes, estornos e histórico.
- Produtos/estoque: variantes, códigos, preços/custos, produtos de venda/consumo, entradas/saídas/ajustes/descarte/transferências/retirada interna, saldo/mínimo, consumo vinculado; controle opcional por lote, validade, FEFO, quarentena, rastreabilidade e recolhimento/acompanhamento.
- Atendimento: visão consolidada, consulta/evolução, rascunho/finalização/adendos, resumo clínico, anamnese, medidas, orientações e aplicações/consumo; registro clínico, estado da agenda e pagamento separados.
- Fotos/exames: captura/upload, classificação por sessão/região/vista, comparação antes/depois e composição; editor/simulador visual de procedimentos; anexos privados de laudos/exames e revisão. Simulação ilustrativa não prevê resultado clínico.
- Documentos: modelos, anamnese, termos, contratos/documentos jurídicos, documentos clínicos, receitas/atestados/pedidos de exames conforme recursos e habilitação; PDFs, histórico, envio e assinatura eletrônica com evidências/verificação. Não confundir com ICP-Brasil homologado.
- CRM: leads, funis/etapas, oportunidades, responsáveis, atividades, propostas e aceite/recusa, indicadores; clientes inativos, retorno por procedimento, vouchers públicos/exclusivos, campanhas e acompanhamento.
- Atendimento digital: caixa de conversas/histórico, repasse humano e pausa da automação, notificações e lembretes conforme canal/configuração; WhatsApp assistido, Notify, Menu, Chat, Chat+AI (B) e Core+AI (A). B informa e direciona ao portal; A opera agenda com confirmação/revalidação. Ambos oferecem catálogo/PDF de produtos elegíveis e dados públicos da empresa. Envio real depende de canal, templates, plano, quotas e homologação.
- Dados/integrações: importação/exportação, histórico de importações, Google Calendar, e-mail transacional, imagens, catálogo de referência, relatórios e calculadoras de retorno para procedimentos/produtos. Condições externas e acesso controlam disponibilidade.
- Administração SaaS: organizações/usuários, planos e limites, cobrança/assinatura, papéis administrativos e auditoria. Área interna da plataforma, não módulo do cliente.

## Aderência por nicho (avaliação funcional, não certificação)

- Alta: estética facial/corporal, estética avançada com habilitação apropriada, salões, barbearias, esmalterias/manicures/pedicures, sobrancelhas/cílios/maquiagem, depilação, massoterapia/spas, serviços capilares.
- Boa mediante configurar documentos e validar fluxos: podologia, tatuagem/piercing, fisioterapia individual, nutrição, psicologia/terapias, fonoaudiologia/terapia ocupacional, consultas particulares, micropigmentação.
- Parcial: odontologia (sem assumir odontograma e gestão odontológica especializada), pilates/academias/escolas (sem assumir turmas, capacidade coletiva ou mensalidades especializadas), pet (sem entidade animal/tutor/prontuário veterinário), assistência técnica (sem ordem de serviço especializada), redes/franquias (sem entidade dedicada de múltiplas unidades).

Configurar por nicho: terminologia, catálogo/categorias, profissionais, jornadas e salas, preços/custos/comissões, pacotes, estoque/consumo, documentos, portal, retornos, identidade e base de informações/regras dos agentes. Alguns textos/telas são clínicos e podem exigir adaptação de interface além das configurações existentes; não prometer que toda a interface é renomeada automaticamente.

## Limites e próximos itens

NFS-e própria e assinatura qualificada ICP-Brasil: implementação/piloto com pendências, não anunciar operação comercial plenamente homologada. Pagamentos de clínicas, Google Calendar e WhatsApp exigem validação real e condições próprias. SMS não ativado. Transcrição/gravação por IA foi adiada explicitamente pelo usuário. Não afirmar teleconsulta por vídeo, TISS completo, certificação de prontuário, odontograma, emissão NF-e de mercadorias ou gestão multiunidade nativa sem desenvolvimento/validação específica.

Preços e teste: `docs/precificacao-aprovada.md`. Preservar condição mensal de R$ 5 para testes; tabela modular e 30 dias grátis são decisões para implementação comercial futura, não comprovação de cobrança já implantada.
