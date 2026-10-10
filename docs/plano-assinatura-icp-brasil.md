# Plano de assinatura qualificada ICP-Brasil

Status: base e persistência próprias implementadas; execução criptográfica A1/nuvem e homologação pendentes.
Origem: proposta prompt_codex_assinatura_icp_brasil.md fornecida pelo usuário.

## Decisão

Adotar módulo desacoplado com fluxo, autorização, persistência e entrega controlados pelo Aggenda. A proposta original previa nuvem na fase 1 e A1 local na fase 2. Após análise de custos, o usuário autorizou avançar com a recomendação de desenvolvimento interno, avaliando A1 local próprio e integração direta em nuvem para mobile, sem construir infraestrutura própria de guarda de certificados em nuvem. Preservar geradores de PDF, assinatura eletrônica do paciente e canais de entrega. Não selecionar fornecedor nem assumir preços sem documentação, proposta comercial e prova de conceito.

## Situação encontrada

- `src/lib/electronic-documents.ts` gera PDFs com pdf-lib; seu nome createSignedDocumentPdf não implica assinatura criptográfica ICP-Brasil.
- `src/actions/electronic-documents.ts` coleta assinatura desenhada, OTP por e-mail e evidências do paciente. Esse fluxo deve continuar separado da assinatura qualificada do profissional.
- As rotas privadas e públicas de PDF regeneram o arquivo com dados atuais da organização e do profissional. Para documentos ICP, devem servir os bytes persistidos e validados.
- `src/db/schema.ts` já contém documentos, profissionais, registros profissionais, eventos e isolamento por organização. As solicitações ICP terão estados próprios, sem reinterpretar os documentos antigos como qualificados.
- A aplicação usa Next.js, Better Auth, Drizzle/Postgres e pdf-lib. Não foi identificado nesta análise um fluxo ICP existente.

## Fluxo previsto

1. Conferir organização, permissão, vínculo do usuário ao profissional e elegibilidade documental.
2. Revisar conteúdo e gerar uma versão imutável do PDF, incluindo dados visuais necessários antes da assinatura.
3. Persistir original privado e SHA-256 dos bytes; criar solicitação idempotente.
4. Iniciar assinatura pelo adaptador, com autorização explícita do titular.
5. Receber callback autenticado ou consultar status; tratar duplicação, atraso e eventos fora de ordem.
6. Obter resultado e validar integridade, cadeia, vigência, revogação, política e identidade do assinante contra o profissional esperado.
7. Somente após validação satisfatória, persistir resultado privado e marcar SIGNED atomicamente. Indisponibilidade do validador mantém PENDING com etapa interna de validação pendente.
8. Download e envio recuperam exclusivamente a versão assinada nesse fluxo. Impressão deve informar que a verificação criptográfica pertence ao arquivo eletrônico.

## Modelo de dados proposto

- `document_artifacts`: organização, documento, versão, tipo original/assinado, chave privada de armazenamento, hash, tamanho, criação e referência ao artefato anterior.
- `document_signature_requests`: organização, documento/artefato, profissional, usuário solicitante, método, provedor, ID externo, chave idempotente, estado PENDING/SIGNED/FAILED/CANCELLED e etapa interna, expiração e datas.
- `document_signatures`: solicitação, artefato resultante, metadados públicos do certificado, identidade conferida e relatório de validação minimizado.
- `document_signature_events`: eventos técnicos e de auditoria minimizados, com deduplicação do callback.

Aplicar índices únicos de idempotência e restrições para impedir referências cruzadas entre organizações. Não armazenar chave privada, PFX ou senha. Cancelar solicitação não revoga uma assinatura já produzida. Múltiplas assinaturas devem gerar versões incrementais preservando as anteriores; habilitação depende de homologação.

## Mapa de arquivos

Arquivos existentes a adaptar:

- `src/db/schema.ts` e nova migração em `drizzle/`: tabelas, índices e restrições.
- `src/lib/electronic-documents.ts`: reutilização do gerador para congelamento do PDF.
- `src/actions/electronic-documents.ts`: integração mínima com emissão e entrega.
- `src/app/api/documents/[id]/pdf/route.ts` e `src/app/api/public/documents/[token]/pdf/route.ts`: servir artefatos ICP persistidos, mantendo autorização e validade dos links.
- Componentes de documentos: botão, prévia, método e status; localizar pontos finais durante implementação, sem reconstruir compositores.
- `src/lib/permissions.ts`: permissão específica de assinatura, além da conferência de identidade.
- `.env.example`: configuração sem segredos reais.

Arquivos novos sugeridos:

- `src/lib/signatures/types.ts`: contratos SignatureProvider e SignatureValidator.
- `src/lib/signatures/service.ts`: orquestração, transições e idempotência.
- `src/lib/signatures/providers/mock.ts`: simulação exclusiva para testes, incapaz de declarar qualificação real.
- `src/lib/signatures/providers/<fornecedor>.ts`: adaptador após seleção.
- `src/lib/signatures/storage.ts`: armazenamento privado de artefatos.
- `src/lib/signatures/validation.ts`: integração com mecanismo real de validação.
- `src/actions/document-signatures.ts`: iniciar, consultar e cancelar quando suportado.
- `src/app/api/webhooks/signatures/[provider]/route.ts`: callbacks autenticados.
- `src/components/document-signature-controls.tsx`: interação responsiva.
- `tests/document-signatures.test.ts`: regras e transições críticas; testes adicionais de integração e e2e conforme infraestrutura escolhida.

## Dependências e decisões em aberto

- Provedor: aceitar PDF externo ou assinatura remota compatível, titular autorizar em mobile, suportar ICP-Brasil/PAdES, oferecer sandbox, callbacks e consulta de status.
- Proposta comercial: implantação, mínimo mensal, franquias, excedentes, certificados, carimbo do tempo, validação, custos por falha e limites.
- Storage privado: escolher serviço, retenção, criptografia, backups e recuperação; não presumir que armazenamento de imagens existente seja adequado.
- Validador: escolher implementação/serviço real; pdf-lib isoladamente não resolve validação criptográfica completa. VALIDAR do ITI é referência de homologação, sem presumir API pública para produção.
- Definir perfil PAdES, política de carimbo do tempo e preservação de evidências para validação futura.
- Confirmar elegibilidade por profissão/documento e vínculo de identidade no cadastro.
- Definir autenticação reforçada, permissões, limites de uso e política de indisponibilidade.
- Avaliar enquadramento CFM/CRM e regras sanitárias, incluindo SNCR quando aplicável. Integração de assinatura não equivale a habilitação de prescrição.

## Etapas e complexidade

1. Base com contratos, tabelas, storage abstrato e mock: média.
2. Congelamento de PDF, autorização, UI e entrega: média/alta.
3. Provedor real, callbacks, reconciliação e validação: alta; depende de sandbox e documentação.
4. Homologação com certificados reais, fluxo móvel e avaliação regulatória: alta e com dependências externas.
5. Agente A1 separado: alta; exige instalador, distribuição, atualizações, segurança da comunicação local e suporte. Sistemas operacionais e biblioteca criptográfica ainda serão definidos.

Não há estimativa financeira ou prazo fechado sem fornecedor, volume e escopo de homologação. O agente A1 evita upload do certificado ao backend; não transforma automaticamente uma chave A1 em não exportável.

## Verificação e critérios de aceite

- Falhas, callbacks falsos e validação inconclusiva nunca produzem SIGNED.
- Repetição da solicitação não duplica assinatura/cobrança quando o contrato do fornecedor permite idempotência.
- Organização A não acessa nem assina documento da B; usuário não assina como outro profissional.
- Certificado de identidade divergente, expirado, revogado ou não confiável é rejeitado conforme política.
- PDF adulterado é rejeitado; original preservado; download retorna exatamente o artefato validado.
- Eventos duplicados e fora de ordem não regridem estados; cancelamento concorrente tem política explícita.
- Fluxos antigos do paciente continuam funcionando.
- Homologação real no VALIDAR do ITI e em dispositivos móveis; mock não é prova de conformidade.
- Antes da produção, confirmar requisitos regulatórios e operação de suporte.

## Operação e rollback

Habilitar por organização com feature flag e começar por piloto. Registrar custos e falhas sem conteúdo clínico nos logs. Reconciliar solicitações pendentes com o provedor. Desabilitar novas solicitações em caso de problema, mantendo acesso aos artefatos assinados e reconciliação dos pedidos já iniciados. Migrações aditivas; não apagar evidências nem arquivos assinados em rollback.

## Base implementada

- Contratos em `src/lib/signatures/types.ts` para provedor, armazenamento privado, autorização, repositório e validador.
- Serviço independente de framework em `src/lib/signatures/service.ts`, com captura dos bytes, chave idempotente, reconciliação e validação antes de SIGNED.
- Mock exclusivo de testes em `src/lib/signatures/providers/mock.ts`; sua conclusão resulta em FAILED/simulation_only, nunca em assinatura qualificada.
- Três tabelas novas: artefatos, solicitações (incluindo evidências resumidas da assinatura) e eventos. FKs compostas limitam vínculos à organização e ao documento; os estados do fluxo antigo ficam intactos.
- Migração `0066_powerful_butterfly.sql` gerada e revisada, ainda não aplicada. O snapshot anterior não incluía migrações manuais recentes; instruções duplicadas de salas/vouchers foram removidas deste SQL. Índices únicos de referência precedem as FKs compostas.
- Testes executáveis com `npm run test:signatures`: doubles para regras de orquestração e validador; criptografia de armazenamento real e testes de adaptadores/migrações com PostgreSQL em memória (PGlite), sem acesso ao banco real nem certificação ICP real.

## Continuação: processo próprio

- `postgres-repository.ts`: solicitações, artefatos e auditoria transacionais; bloqueio de solicitação paralela por documento, comparação de estado e detecção de IDs divergentes do provedor.
- `postgres-storage.ts` e `encryption.ts`: PDFs privados criptografados com AES-256-GCM no Postgres existente, vinculados por AAD à organização e chave de artefato, com gravação imutável e limite de 10 MiB por PDF. É opção inicial para o piloto; consome armazenamento, backup e transferência do banco. Não constitui armazenamento de certificado/chave privada do profissional.
- `authorization.ts` e `postgres-authorization.ts`: permissão `documents.sign`, vínculo usuário/profissional, organização, elegibilidade documental e evidência de autorização recente ligada ao hash do PDF. O resolvedor de evidência deve vir de um método real verificado, nunca de CPF ou booleano fornecido pelo navegador. Não há fallback permissivo. Habilitação profissional e elegibilidade regulatória devem ser confirmadas antes de configurar os tipos permitidos.
- `runtime.ts`: composição interna com sessão real, exigindo método e validador explicitamente fornecidos; rejeita mock.
- `delivery.ts` e `document-download.ts`: leitura dos bytes persistidos com verificação de hash e tamanho. Rotas privadas e públicas de PDF usam essa leitura após sua autorização normal. Quando existe solicitação ICP, PENDING/FAILED/CANCELLED não retornam PDF regenerado; falha de integridade/armazenamento retorna indisponibilidade. Documentos legados sem solicitação continuam no gerador existente.
- `GET /api/documents/[id]/signature`: consulta autenticada e minimizada do estado; profissional sem acesso global só consulta documento de sua autoria. Nenhum CPF ou segredo é retornado.
- Cancelamento no serviço depende de autorização e confirmação do estado remoto; resposta de cancelamento sem confirmação não muda para CANCELLED.
- Migração adicional `0067_tearful_tiger_shark.sql` para arquivos criptografados. Ambas as migrações foram verificadas no motor PostgreSQL em memória, não aplicadas ao banco da aplicação.

### Configuração e operação

Configurar `SIGNATURE_STORAGE_KEYS` como JSON de identificadores e chaves AES-256 em Base64 (32 bytes aleatórios por chave), e `SIGNATURE_STORAGE_ACTIVE_KEY` com o identificador ativo. Os valores são exclusivamente do servidor. Preservar chaves antigas enquanto houver documentos ou backups cifrados com elas; alterar a chave ativa afeta novas gravações, sem recifrar automaticamente os arquivos antigos. Guardar backup seguro das chaves separado do backup do banco. A perda de uma chave torna seus PDFs irrecuperáveis.

Aplicar migrações em ambiente de homologação antes do piloto. As rotas verificam a existência da tabela de solicitações para manter compatibilidade com a aplicação antes da migração 0066. Depois que existir solicitação, erros nunca provocam fallback para documento sem assinatura. Em rollback, manter o código de leitura, as tabelas e as chaves; desabilitar apenas criação de novas solicitações. Monitorar volume de blobs e arquivos órfãos de concorrência/falha; limpeza futura deve considerar todas as referências e retenção, sem excluir evidências.

### Limites desta entrega e próximo passo

Persistência, controles e entrega estão implementados, mas não há botão público nem endpoint de início de assinatura, agente A1, webhook de provedor ou validador ICP-Brasil real. O próximo passo é implementar e homologar o método A1 desktop (começando por Windows, sujeito à confirmação do escopo de sistemas), incluindo canal autenticado com origem restrita, aprovação humana, proteção contra replay, montagem PAdES e verificação de cadeia/revogação. Somente após validar esse ciclo com certificado real será habilitada a operação para o profissional. Mobile seguirá por integração em nuvem, sem guarda própria de chaves pelo Aggenda. Não enviar documentos de pacientes ao mock e não declarar conformidade com base nos testes sintéticos.
