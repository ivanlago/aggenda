# Apuração do emissor próprio — 15/10/2026

## Conclusão executiva

Não foi identificado um custo fixo obrigatório de R$ 1.500/mês nem uma licença por A1 para a implementação própria existente. O usuário confirmou hospedagem e ferramentas com pagamento fixo e banco com pagamento por uso. O desembolso incremental comprovadamente variável está no Neon; ele depende sobretudo do tempo adicional em que o banco permanece ativo, do tamanho do compute e dos dados retidos. Não é correto garantir incremento zero no banco Launch.

A medição sintética indica custo baixo de processamento criptográfico e de armazenamento por nota, mas não comprova custo total de produção. Falta homologação real, concluir funções e controles e confirmar a cobertura contratual do desenvolvimento. Não houve implantação, migração, alteração de plano, configuração, chave ou certificado durante a apuração.

## Evidências da infraestrutura

Consultas de metadados dos conectores Neon e Vercel e duas consultas SQL somente de leitura, sem buscar dados de pacientes ou descriptografar certificados:

| Evidência | Resultado observado | Limite da conclusão |
|---|---|---|
| Projeto Vercel | `aggenda`, Next.js, Node 24.x, último deployment de produção `READY` | Não comprova capacidade restante nem preço fixo contratado |
| Faturas/consumo Vercel | API de cobranças: `404 costs_not_found`; métricas: `404 not_found` | Ausência de retorno não significa custo ou consumo zero |
| CLI Vercel | Versão local 32.5.0 não aceita `--non-interactive`; tentativa restrita também não carregou usuário | Não foi atualizada nem reautenticada a ferramenta |
| Plano Neon | `launch_v3`, nome Launch; região AWS us-east-1 | Tarifa contratual/benefícios devem ser conferidos na fatura; cálculo abaixo usa preço público atual |
| Banco da aplicação | `neondb`, cerca de 17,33 MB | Tamanho atual, não consumo mensal nem soma de todos os bancos/branches |
| Branch de produção | Tamanho lógico informado de cerca de 41,38 MB | Métrica de escopo diferente do tamanho de `neondb`; não somar os valores |
| Compute | Mínimo 0,25 CU, máximo 8 CU; suspensão configurada como `0` | `0` usa o padrão de 300 segundos, não significa sempre ligado |
| Histórico de restauração | 21.600 segundos: 6 horas | Não demonstra restauração já testada |
| Snapshots Neon | Nenhum snapshot e nenhuma frequência agendada retornados | Não exclui backups externos não acessíveis nesta apuração |
| Migração do emissor | `nfse_requests` ausente no banco conectado | O novo piloto local ainda não está pronto para ser utilizado nesse banco |
| Cadastro fiscal existente | 1 integração com provider `nfse` | Não foi lido seu conteúdo privado; não confirma A1 válido ou homologação |
| Ambiente local | `BETTER_AUTH_SECRET` presente; `FINANCIAL_INTEGRATION_SECRET` ausente | Verificação apenas de presença, sem registrar valores; não comprova a configuração de produção |

O contador do projeto Neon no período de 01/10 a 01/11, consultado em 15/10, informou 23.599 segundos de compute ponderado e 90.844 segundos de atividade. São aproximadamente 6,56 CU-h e 25,23 horas de atividade. Ao preço público de US$ 0,106/CU-h, o componente compute corresponderia nominalmente a US$ 0,69 até a consulta, antes de créditos, tarifas contratuais e demais itens. Não é fatura consolidada nem custo da NFS-e: o novo emissor ainda não está implantado.

## Medição reproduzível

Executar `node node_modules/tsx/dist/cli.mjs scripts/measure-nfse.ts`. Resultado completo em `docs/nfse-medicao-local.json`.

- Windows, Node 22.19.0, Intel i7-8565U; a produção foi identificada como Node 24.x. Não presumir desempenho idêntico.
- Certificado RSA-2048 sintético, autossinado, válido apenas para os testes. A chave privada não foi escrita em arquivo.
- 5 execuções de aquecimento e 80 repetições por operação.
- PGlite isolado executando a migração real `0068_nfse_requests.sql` e os métodos reais do serviço; transporte governamental simulado. Nenhum registro fiscal foi criado no banco conectado.

| Operação local | Mediana | P95 | CPU média por repetição |
|---|---:|---:|---:|
| Abrir e conferir o A1 sintético | 14,89 ms | 16,07 ms | 15,43 ms |
| Assinar DPS com chave já aberta | 3,70 ms | 5,29 ms | 7,04 ms |
| Abrir A1 + preparar DPS + assinar + criptografar + compactar | 17,48 ms | 19,90 ms | 19,14 ms |

CPU é contabilizada pelo processo, inclusive threads, e pode superar tempo de relógio. Os valores não incluem autenticação do usuário, consultas remotas ao banco, comunicação TLS com o governo, PDF, e-mail ou carregamento/renderização da página. Não extrapolar para vazão ou SLA de produção.

O núcleo de um ciclo de preparação, envio com timeout e recuperação fez 12 instruções de dados: 7 SELECTs, 1 INSERT e 4 UPDATEs. O transporte simulado recebeu 3 chamadas: envio e duas consultas. Há acessos adicionais do contexto de cada ação, autenticação, auditoria e interface. Comandos de transação não apareceram no logger do driver e não estão incluídos nessa contagem.

### Espaço consumido

| XML de retorno sintético | Total dos três conteúdos criptografados por nota* |
|---:|---:|
| 8.529 bytes | 15.838 bytes |
| 33.105 bytes | 48.606 bytes |
| 131.409 bytes | 179.678 bytes |

\* Rascunho + DPS assinada + XML retornado; não inclui índices, outras colunas, auditoria, PDF, histórico, WAL ou backups. Os tamanhos de retorno são cenários sintéticos, não XMLs de notas reais emitidas.

Em 100 inserts finais com o cenário intermediário, a tabela com índices e TOAST cresceu de 98.304 para 5.455.872 bytes: aproximadamente **53.576 bytes por nota**. É uma amostra de alocação no PGlite, sem medir o ciclo completo de atualizações, páginas mortas ou retenção. Não representa uma medição de armazenamento faturável no Neon.

O certificado sintético ocupou 2.313 bytes em PFX e 4.252 bytes no formato criptografado armazenado. Certificados reais, cadeias e número de clínicas podem diferir. Esse dado mostra apenas o tamanho dessa amostra, não um custo fixo por certificado.

## Conversão para custos do banco

Preços públicos atuais de referência do Launch: **US$ 0,106/CU-h**, **US$ 0,35/GB-mês** para banco, histórico **US$ 0,20/GB-mês** conforme volume retido de mudanças e snapshots **US$ 0,09/GB-mês**. O contrato, créditos e fatura efetivos do Aggenda prevalecem.

### Dados: projeção apenas do cenário intermediário medido

Usando 53.576 bytes/nota e GB decimal para aproximação:

| Emissões por mês | Dados acrescentados por lote mensal | Custo mensal de manter esse lote inteiro | Custo mensal do estoque ao completar 12 lotes iguais |
|---:|---:|---:|---:|
| 1.000 | 0,054 GB | US$ 0,019 | US$ 0,225 |
| 10.000 | 0,536 GB | US$ 0,188 | US$ 2,250 |
| 50.000 | 2,679 GB | US$ 0,938 | US$ 11,251 |

São valores de estoque retido, **não o custo total por mês da operação**. Durante o primeiro mês, o lote vai sendo produzido e sua cobrança proporcional pode ser menor. PDFs, consultas, histórico, backups, crescimento da auditoria e armazenamento das demais funções aumentam o consumo. O total cresce se todos os lotes forem mantidos. Não foi definido nem recomendado prazo legal de retenção nesta projeção.

### Compute: a frequência pode custar mais do que o tamanho dos XMLs

A cobrança depende da capacidade × tempo ativo. No mínimo observado de 0,25 CU, ao preço público, estes são exemplos matemáticos de **tempo adicional** por 30 dias:

| Atividade adicional real no banco | Custo de compute |
|---|---:|
| 1 hora por dia | US$ 0,795/mês |
| 8 horas por dia | US$ 6,36/mês |
| 24 horas por dia | US$ 19,08/mês |

Não somar períodos que já seriam ativos pelas outras funções. Uma nota pode acrescentar quase nenhum tempo ativo se o banco já estiver em uso, ou prolongar a atividade após uma reativação. Uma rotina de consulta a cada minuto pode impedir a suspensão; por isso, monitoramento e recuperação devem evitar polling contínuo no banco sem necessidade. Autoscaling acima de 0,25 CU altera os valores; 8 CU é somente o teto configurado, não consumo atual ou previsão.

### Hospedagem e ferramentas fixas

Pela informação fornecida pelo usuário, considerar R$ 0 de nova mensalidade enquanto não houver mudança de plano, recurso adicional ou excedente contratual. Não foi comprovada folga suficiente para qualquer volume. A Vercel pode medir CPU e memória de forma distinta, mas, sem fatura/métricas e termos do plano, não foi convertido o benchmark local em uma nova cobrança dessa hospedagem. Nenhum gasto por WhatsApp, SMS ou e-mail fora do plano foi presumido.

Não há valor total real em reais nesta etapa: faltam fatura detalhada/benefícios e perfil de uso fiscal real. Não foi adotado câmbio fictício. A fórmula verificável é:

`incremento = compute adicional do banco + dados e histórico adicionais + backups adicionais + eventual excedente das ferramentas/hospedagem + serviços novos expressamente escolhidos`.

## Pendências técnicas, ordenadas para lançamento

| Trabalho | O que já existe | O que falta confirmar ou implementar | Despesa externa obrigatória identificada |
|---|---|---|---|
| Homologação real | DPS, assinatura, mTLS, consulta e testes sintéticos | A1 real, cadastro de uma clínica, município, série, contratos reais da API e rejeições | Nenhuma taxa de homologação identificada; o A1 continua sendo da clínica |
| Habilitação do piloto no ambiente apropriado | Migração versionada e testada no PGlite | Executar no banco de desenvolvimento e conferir a jornada pela interface | Nenhuma assinatura nova identificada |
| Custódia de A1 | AES-256-GCM e vínculo ao cadastro fiscal | Chave dedicada; identificação de versão; rotação/recriptografia compatível com registros antigos; vínculo criptográfico à clínica; revogação de autorização e descarte; guarda e restauração das chaves | Pode ser feito com recursos existentes; decidir se haverá serviço externo de chaves |
| Confirmação e falhas | Claim atômico e consulta após timeout | Distinguir rejeição definitiva de resultado desconhecido; correção/reenvio seguro; recuperação de solicitações interrompidas e limitações da API | Trabalho de implementação/homologação |
| Auditoria | Registro de preparação, envio e configuração | Resultado autorizado/rejeitado, consultas, download, substituição/remoção de certificado e consistência quando o log falha após a emissão | Recursos existentes, com crescimento do banco |
| Operação e suporte | Status manual e aviso de vencimento na tela | Alertas de falha, fluxo de atendimento, responsáveis e métricas; execução sem manter o banco ativo desnecessariamente | Não exige automaticamente Sentry ou outro produto novo |
| Recuperação | Janela Neon de 6 horas | Política de backup apropriada, agendamento ou backup externo e teste de restauração; recuperação separada das chaves | Snapshot/armazenamento por uso se escolhido; sem taxa de ferramenta presumida |
| Funções fiscais | Emissão/consulta de teste e XML privado | Cancelamento, DANFSe e procedimentos aplicáveis de substituição | Trabalho restante, não uma compra já demonstrada |
| Cobertura | Simples Nacional em cenário limitado | Confirmar escopo das primeiras clínicas; IBS/CBS e casos exigidos; outros regimes e peculiaridades municipais conforme demanda | Desenvolvimento/manutenção; cobertura de parceiro é opcional |
| Entrega e contador | Dados e XML privado | Entrega, exportação e permissões mínimas do contador conforme oferta | Pode aproveitar ferramentas existentes; medir e-mail/armazenamento |

Ter pago o desenvolvimento existente não permite concluir se essas pendências já estão incluídas no contrato. A pergunta sobre cobertura de manutenção/conclusão não foi respondida; não foi localizado contrato comercial no escopo de arquivos pesquisado. Não foi inventada uma tarifa por hora nem atribuído valor em reais a esse trabalho.

## Decisão recomendada após a apuração

Manter a emissão própria no plano de desenvolvimento: não apareceu uma necessidade de mensalidade fixa alta para custódia/assinatura. Usar um piloto de uma clínica para fechar o ciclo funcional e medir tamanhos e latências reais. Priorizar chave dedicada com migração segura, recuperação de falhas, auditoria e restauração. Não trocar a chave atual diretamente, pois isso pode tornar credenciais existentes ilegíveis.

Só então medir uma janela de operação fiscal e comparar, no banco, a diferença de CU-h, armazenamento e histórico em horários equivalentes. Registrar a sobreposição com o uso normal da aplicação. Para 100 clínicas × 100 notas, a referência anterior de parceiro era R$ 1.322/mês; o valor efetivamente evitado será esse custo elegível menos o incremento real e o trabalho adicional contratado. Ainda não se pode declarar toda essa diferença como lucro líquido.

## Fontes públicas

- [Preços do Neon](https://neon.com/pricing) — tarifas de referência consultadas em 15/10/2026.
- [Métricas de consumo Neon](https://neon.com/platforms) — definição dos contadores ponderados de compute.
- [Configuração de suspensão: material oficial Neon](https://github.com/neondatabase/ai-rules/blob/main/neon-api-projects.mdc) — valor 0 usa o padrão de 300 segundos.
- [Cobrança de Functions Vercel](https://vercel.com/docs/functions/usage-and-pricing) — CPU e memória têm bases distintas; tabela pública não substitui a fatura/contrato.
- [Preços Focus](https://focusnfe.com.br/precos/) — comparação comercial anterior, não fornecedor contratado.
