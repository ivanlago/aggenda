# Atualização dos catálogos no Coolify

Recurso `Aggenda Catálogos`, projeto Aggenda, ambiente production, UUID `szejybtgedfffwzqcy26fjhc`. Executa em contêiner separado do Outbox/WhatsApp, sem domínio público.

## Configuração

- Fonte: repositório público `ivanlago/aggenda`, branch `main` (implantação manual pelo Coolify, sem GitHub Actions).
- Nixpacks com Node 22; instalação `npm ci`; build `node --version`; início `sleep infinity`. Não executa o servidor Next.js.
- `DATABASE_URL` somente em runtime. Role `aggenda_catalog_coolify`, com CONNECT no banco, USAGE no schema public e SELECT/INSERT/UPDATE apenas em `reference_releases`, `reference_entries`, `reference_sync_runs`. Sem acesso aos dados clínicos, DELETE, criação de objetos ou administração do banco.
- Limites do contêiner: 0,5 CPU e 1 GB de RAM. Sem consulta ao Neon enquanto aguarda a próxima execução.
- Tarefa `Atualizar catálogos oficiais`, UUID `hchqsmygsfn8d3twaysdt5k8`.
- Comando: `cd /app && npm run reference:sync`.
- Frequência: `0 6 * * 0` no servidor configurado em UTC, equivalente a domingo às 03h em America/Bahia.
- Timeout: 10.800 segundos (3 horas). Bloqueio consultivo no PostgreSQL evita sobreposição de execuções.

## Operação e conferência

Abrir o recurso no Coolify → Scheduled Tasks → Atualizar catálogos oficiais → Execute now. Conferir status e saída em Recent executions; depois confirmar a última tentativa e versão em Configurações → Catálogos no Aggenda. O código preserva a última edição válida se a fonte oficial estiver indisponível ou a validação reprovar a carga.

TUSS 20, TUSS 22 e Anvisa são sincronizados. CID-10 continua exigindo arquivo oficial conferido. Implantar novamente o recurso quando houver alteração nos scripts; a execução agendada usa o código já implantado.

## Fonte TUSS e retomada

A rotina descobre a edição vigente na página oficial do TISS e usa o pacote de Representação de Conceitos em Saúde como fonte principal. Lê o índice do ZIP por HTTP Range e baixa apenas a planilha da tabela solicitada, sem baixar materiais/OPME. Valida ETag em todos os intervalos, tamanho, CRC, tabela, edição, cabeçalhos, códigos e vigências. Em 21/10/2026, a edição localizada foi `ANS-TISS-202609`: 45.355 medicamentos e 5.969 procedimentos.

Quando o pacote não pode ser obtido, usa a API OCL. Páginas concluídas são salvas atomicamente em `tmp/reference-catalogs/checkpoints`, ou no diretório indicado em `REFERENCE_CACHE_DIR`. Uma falha transitória dispara mais uma tentativa aproveitando o checkpoint. Há até três tentativas por página em cada download. O cache expira em seis horas e é invalidado quando a primeira página ou os metadados da fonte mudam; dados corrompidos são rejeitados. OCL não oferece identificador transacional de edição: esses controles não equivalem a um snapshot oficial imutável. Nenhum checkpoint é disponibilizado às buscas; só uma carga completa e validada pode ser publicada.

No Coolify, montar um volume persistente em `/app/tmp/reference-catalogs/checkpoints` para conservar páginas após recriação do contêiner. `REFERENCE_TUSS_SOURCE=api` força a API e `package` exige o pacote oficial; o padrão `auto` tenta pacote e depois API. Essas variáveis pertencem ao executor, não ao navegador do cliente.

Para importar uma planilha oficial conferida manualmente: `npm run reference:import -- tuss-20 <arquivo.xlsx> 202609` (ou `tuss-22`). O arquivo deve conter a tabela e a edição declaradas. A origem do arquivo manual deve ser conferida pelo operador; a descoberta automática utiliza somente domínios oficiais da ANS.

Em 21/10/2026, a implantação `a5uo4vm7omfwnbx8aiv8ys4u` concluiu e a execução manual da tarefa durou 16m32s. A Anvisa publicou 32.905 registros com versão de origem `Tue, 13 Oct 2026 19:10:26 GMT`; uma segunda validação pelo mesmo contêiner e credencial retornou `unchanged`, sem duplicar a edição. TUSS 22 e TUSS 20 falharam por timeout da API oficial da ANS; suas versões legadas anteriores foram preservadas. Por isso a tarefa completa terminou com erro, sinalizando corretamente a falha parcial. Esse teste inicial confirmou a infraestrutura e a sincronização Anvisa; a falha de download motivou a adoção do pacote oficial e dos checkpoints descritos acima. Conferir a execução semanal e tratar a indisponibilidade da ANS se persistir.

O workflow antigo foi desativado no GitHub e a role exclusiva anterior recebeu NOLOGIN. O secret antigo não permite mais conexão. A credencial do Coolify foi verificada sem SELECT em clientes/documentos nem CREATE no schema; o arquivo temporário de transporte foi removido após o cadastro. Não registrar a URL de conexão em documentação ou logs.
