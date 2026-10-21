# Catálogos de referência — 21/10/2026

TUSS 20 (medicamentos), TUSS 22 (procedimentos/exames), CID-10 e medicamentos Anvisa passam a ser consultados no PostgreSQL. Arquivos e API são fontes de importação, sem download durante o atendimento. Não há inclusão de CMED, interações medicamentosas ou apoio automatizado à prescrição nesta entrega.

## Publicação e histórico

A migração `0079_reference_catalogs` cria versões, entradas e tentativas de atualização, índices de código e busca textual GIN e `services.tuss_reference`. Não modifica documentos anteriores, códigos de serviços ou estoque. Uma versão ativa por catálogo; entradas de versões anteriores permanecem disponíveis para resolver referências já utilizadas.

Importações validam estrutura, codificação, códigos, unicidade e datas antes da publicação. Carga vazia, redução superior a 10%, arquivo incompleto ou repetição inconsistente de páginas bloqueiam a substituição. A transação só troca a versão ativa depois de inserir toda a nova edição. Um checksum semântico evita criar versões por simples mudança de ordem. Tentativas têm início, fim e resultado; falhas de download também são registradas.

Buscas exigem sessão autenticada, aceitam códigos sem pontuação e palavras em qualquer ordem, com prefixos, sem diferenciar acentos. Há aliases revisados para RM, TC, RX e US, paginação de até 100 itens e prioridade para código exato. Não há equivalência clínica inferida nem correção automática de diagnóstico.

Vigência inicial e final são inclusivas, com data nacional em America/Bahia. Itens inativos, vencidos ou futuros ficam fora da busca padrão. A opção de consulta histórica mostra esses itens sem permitir selecioná-los para novo uso. A emissão valida novamente a situação na versão ativa quando há referência estruturada; os campos manuais permanecem disponíveis sob responsabilidade do emissor.

Seleções guardam catálogo, versão imutável, código e descrição de origem. O servidor resolve a referência no banco, sem confiar no nome/versionamento recebido do navegador. Receitas, atestados, exames e o compositor genérico preservam as referências em `structuredData`; o texto emitido continua sendo um snapshot. Serviços guardam a seleção TUSS; o exame solicitado copia essa referência. Registros antigos não recebem uma versão presumida retroativamente.

## Fontes e limites

- TUSS: API OCL indicada pela [ANS](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/codigos-da-tuss), em `https://consulta-ocl.apps.sa-1a.mendixcloud.com/rest/oclservice/ANS`. A documentação confirmou páginas de 25 conceitos. A rotina usa quatro requisições simultâneas, até três tentativas por falha transitória de página, progresso no log e conferência da contagem anunciada antes e depois. Não é um identificador transacional de edição da fonte: o Aggenda identifica o conteúdo importado por checksum e registra a data de obtenção.
- CID-10: importação de arquivo oficial conferido. O arquivo existente usa Windows-1252 e aspas literais, enquanto os CSV TUSS existentes usam escape por barra invertida. Os leitores foram ajustados a esses formatos: 12.451 entradas CID, 43.376 TUSS 20 e 5.966 TUSS 22. A versão oficial desses arquivos locais não está comprovada e o bootstrap os identifica como `arquivo-legado-<hash>`; a data de importação não é apresentada como data de atualização oficial.
- Anvisa: `https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv`, Windows-1252. O arquivo publica produtos/registro, processo, princípio ativo, empresa e situação, sem todas as apresentações/concentrações. Não se deduz apresentação pelo nome e não se convertem registros em códigos TUSS. Registros usam `registro:<id>`; sem registro, `processo:<id>`; linhas sem ambos não são selecionáveis.
- O arquivo Anvisa de 13/10/2026 foi conferido integralmente: 32.905 identificadores consolidados, 7.999 sem divergência e ativos, 2.429 com informações divergentes. Repetições idênticas são consolidadas. Se um mesmo identificador apresentar situações ou dados divergentes, o resultado é marcado como divergente, sem seleção para emissão. Consulte o registro oficial e a apresentação concreta antes do uso. Nenhum vínculo Anvisa↔TUSS é inferido por semelhança de nome.

## Ativação

1. Aplicar a migração 0079 com o fluxo normal do projeto, antes de publicar o código que consulta as novas tabelas. Conferir migrações pendentes; testar primeiro em ambiente isolado.
2. Executar `npm run reference:bootstrap` para incorporar os três arquivos existentes e manter a cobertura inicial. O bootstrap não pode substituir uma edição já sincronizada da fonte oficial.
3. Executar `npm run reference:sync -- anvisa-medications` e `npm run reference:sync -- tuss-22` / `tuss-20`, ou `npm run reference:sync` para as três fontes. API TUSS pode exigir muitos minutos; executar em worker/CI, não em função HTTP curta. Timeout/indisponibilidade preservam a versão anterior.
4. Para edição oficial conferida via arquivo, usar `npm run reference:import -- cid-10 <arquivo> <versão>`. O mesmo comando aceita CSV dos demais catálogos nos formatos documentados. Não automatizar troca de CID-10 por outra classificação sem adaptação dos fluxos.
5. A rotina `.github/workflows/reference-catalogs.yml` está preparada para execução manual e semanal, domingo às 03h da Bahia. Para ativá-la, publicar o workflow no GitHub e configurar o secret `DATABASE_URL` no repositório autorizado. Ela usa conexão direta, bloqueio contra execução simultânea e registra falhas no banco; execução com falha sinaliza erro no CI. Não se copiam credenciais do ambiente local automaticamente para o GitHub.

`Configurações → Catálogos` mostra fonte, versão, quantidade, importação e última tentativa. `CRON_SECRET` não é necessário para este workflow; não existe endpoint público de importação.

Nesta entrega, a migração passou em PostgreSQL isolado e na branch temporária `codex-reference-catalogs-20261021` do Neon. A branch tem expiração automática em 22/10/2026, 02h02 da Bahia. A migração 0079 foi aplicada ao banco conectado; os três arquivos anteriores e os 32.905 registros consolidados da Anvisa foram publicados. Buscas reais de exame, CID e princípio ativo retornaram resultados. A tentativa de atualização direta da TUSS 22 foi interrompida por timeout da API da ANS; a edição inicial foi preservada e a falha ficou registrada. TUSS e CID continuam identificados como arquivos legados, sem declaração de que sejam as edições oficiais mais recentes. A ativação do workflow no GitHub ainda depende de publicação do código e configuração do secret no repositório.

## Validação

`npm run test:references` executa a migração real em PGlite/PostgreSQL, carga dos arquivos completos, validação de formatos, consolidação Anvisa, paginação da fonte com repetição após falha transitória, vigência inclusiva, pesquisa por alias/acentos, paginação, isolamento entre catálogos, falhas de importação, rollback da publicação, referência adulterada, recusa de item inativo na emissão e preservação da versão selecionada após atualização.
