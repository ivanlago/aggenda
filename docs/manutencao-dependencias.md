# Manutenção de dependências — 16/10/2026

## Resultado e alcance

A auditoria original apontava 20 alertas agregados (1 crítico, 12 altos e 7 moderados). Após as atualizações, o npm aponta 6 altos, sem críticos ou moderados. Os seis são dois avisos sem versão oficial corrigida: `node-forge` e `braces`; o aviso de braces se propaga a micromatch, fast-glob, @next/eslint-plugin-next e eslint-config-next. Não foram ocultados nem removidos da auditoria.

As alterações são locais. Não houve deploy, migração no banco conectado, envio de e-mail real ou uso de certificado/paciente real. O design e as regras do agendamento externo permanecem sem alterações.

## Atualizações

- Next.js e eslint-config-next: 16.2.12 → 16.4.2, fixados na mesma versão. Sharp e os componentes internos do Next foram atualizados pelo lockfile.
- Better Auth: 1.6.25 → 1.7.10 no lockfile, com sua cadeia de adaptadores, jose e utilitários.
- Drizzle Kit: 0.31.10 → 0.31.11. O esbuild usado por @esbuild-kit/core-utils foi substituído por 0.25.12 através de override específico; o esbuild próprio do tsx mantém sua versão compatível.
- ExcelJS continua em 4.4.0, com override de uuid para 11.1.1. O uso da biblioteca é v4, cuja interface é preservada; o teste gera e relê XLSX com valores, datas, texto acentuado e formatação condicional estendida.
- Atualizações compatíveis no lockfile incluem brace-expansion, js-yaml, nanoid, source-map-js e dependências relacionadas. Não foi usado `npm audit fix --force` nem downgrade de Next/Drizzle/ExcelJS.
- `agentRules: false` mantém o comportamento anterior de não gerar arquivos de instrução de agentes automaticamente ao iniciar o Next 16.4.

## Mitigações temporárias: não equivalem a versões oficiais corrigidas

### node-forge / GHSA-86w9-cpqp-85rv

Versão fixada em 1.4.0. `scripts/patch-forge-security.mjs` aplica uma verificação de quantidade de elementos na sequência DigestAlgorithm aninhada, baseada na proposta pública https://github.com/digitalbazaar/forge/pull/1152/files. Exige hash SHA-256 exato do arquivo upstream e falha se a versão ou o conteúdo mudar. A proposta ainda não é uma versão oficial corrigida.

O teste produz uma assinatura sintética com elementos extras nessa estrutura e verifica sua rejeição, mantendo a aceitação de assinatura canônica. O código fiscal usa Forge para abrir o PKCS#12; assinaturas XML são verificadas com xml-crypto/Node, e o fluxo CMS existente usa PKI.js. A mitigação evita manter a primitiva vulnerável sem proteção, mas não comprova segurança de todos os usos possíveis da biblioteca.

### braces / GHSA-vfj7-8cjw-p6xm

Versão 3.0.3, presente na cadeia de ferramentas de lint. `scripts/patch-dependency-security.mjs` limita a profundidade do parser e dos percursos recursivos de compile, expand e stringify a 64 níveis. Testes cobrem padrões usuais, padrões profundamente aninhados, parênteses e AST fornecida diretamente. Os quatro arquivos precisam corresponder aos hashes upstream esperados antes de qualquer escrita. Esta é uma mitigação local contra a falha de profundidade relatada, não uma correção oficial ou garantia contra todo consumo excessivo possível em expansão de padrões.

### Aplicação e revisão

`postinstall`, `prebuild`, `predev` e `prestart` executam o verificador/aplicador. As duas operações são idempotentes e não consultam a rede. A etapa de braces é dispensada quando esse pacote de desenvolvimento não está instalado; a proteção de Forge continua obrigatória. Instalações que usam `--ignore-scripts` precisam executar `node scripts/patch-dependency-security.mjs` antes dos testes/build. Não editar node_modules manualmente como solução permanente.

Quando sair uma versão oficial corrigida, atualizar a versão e o lockfile, remover apenas a mitigação substituída e repetir os testes. Os guardas de versão/hash exigem essa revisão em vez de aplicar a correção cegamente a um código diferente. Reconsultar os avisos antes da liberação de produção; seis alertas visíveis continuam sendo uma pendência de atualização oficial.

Avisos: https://github.com/advisories/GHSA-86w9-cpqp-85rv e https://github.com/advisories/GHSA-vfj7-8cjw-p6xm.

## Verificação

- Rodada completa (`tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`): 141 testes encontrados, 139 passaram e 2 ignorados. Os dois testes ignorados dependem do banco conectado e ficaram explicitamente desativados (`RUN_DATABASE_TESTS=0`).
- TypeScript (`tsc --noEmit`) e lint dos arquivos alterados passaram. O lint completo terminou sem erros, com dois avisos de navegação em arquivos não alterados (`pending-sign-out-button.tsx` e `invitation-account-button.tsx`), detectados pela versão nova do plugin Next.
- `npm run build`: passou com Next.js 16.4.2 e download das fontes existentes autorizado. A primeira tentativa sem rede falhou no download do Google Fonts.
- `npm run test:clinical`: 14 testes passaram; banco isolado, interface em DOM simulado e permissões.
- `npm run test:nfse`: 13 testes passaram com certificados sintéticos e transporte simulado.
- `npm run test:signatures`: 36 testes passaram, incluindo CMS real sintético e persistência em PostgreSQL isolado.
- `npm run test:security`: cobre as duas mitigações, round-trip XLSX e autenticação real do Aggenda contra PostgreSQL isolado. Login, senha incorreta, origem não autorizada, sessão, logout e reset de senha são exercitados; o envio de e-mail é simulado.
- 22 testes de apoio ao agendamento externo (cupons, sinal, telefone, mídias sociais e domínios) passaram.
- `drizzle-kit check`: passou, sem executar migrações. `npm ls` confirmou a árvore consistente sem dependências inválidas.
- HTTP local: `/entrar` respondeu 200 com o formulário e `/api/auth/get-session` respondeu 200 sem sessão. Servidor de desenvolvimento reiniciado na porta 3000.
- A automação de navegador não iniciou (`failed to write kernel assets`, os error 3). Não houve confirmação visual ou fluxo autenticado completo em navegador real. Login com Google, serviços externos e produção não foram testados.

Antes de publicar: executar `npm ci` com scripts habilitados no ambiente de destino, repetir testes/build e conferir o fluxo autenticado e o agendamento externo em navegador. A compilação não publica a aplicação.
