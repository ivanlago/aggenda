# Emissor NFS-e: piloto de homologação

Implementação local para testar o ciclo nacional: cadastro A1, recebimento confirmado → rascunho → revisão → DPS assinada → transmissão mTLS → consulta por DPS → recuperação e download privado do XML autorizado.

**Não habilitado para produção.** Nenhuma nota real foi emitida durante o desenvolvimento. Os testes utilizam certificado sintético e transporte simulado. A consulta municipal não comprova habilitação individual, e HTTP 200 sem campos reconhecidos não é tratado como compatibilidade. Autorizar um parceiro no cadastro não configura uma integração fiscal.

## Preparação do ambiente

### Formas de emissão na interface

Em `/financeiro/nfse`, o usuário pode consultar o piloto nacional com A1, consultar a alternativa municipal ou registrar uma nota emitida fora do Aggenda. A escolha na URL é apenas de apresentação: não altera o perfil fiscal salvo, credenciais, contrato ou autorização de produção.

O A1 com CNPJ é requisito do conector atual. Não existe conector municipal por usuário/senha homologado nesta implementação. Informar município e regime não confirma cobertura. Antes de habilitar essa alternativa, é necessário selecionar e homologar um conector direto ou parceiro, verificar autenticação e credenciamento do prestador e validar emissão, consulta e cancelamento. Nenhuma senha municipal ou gov.br é coletada nesta tela.

O registro externo guarda os dados de uma nota já emitida e permite abrir seu endereço de verificação. Não emite outra nota, não valida sua autenticidade e não consome a franquia de emissão automática. A solicitação de configuração do piloto registra ciência de homologação, sem aceite de preços; a contratação continua centralizada em Administração → Assinaturas.

1. Instalar as dependências com `npm ci`.
2. Configurar `NFSE_STORAGE_KEYS` (JSON com chaves aleatórias de 32 bytes em Base64) e `NFSE_STORAGE_ACTIVE_KEY` (identificador ativo). Não reutilizar segredos de autenticação ou prontuários. Preservar as chaves antigas enquanto houver dados ou backups dependentes delas. Preservar também `FINANCIAL_INTEGRATION_SECRET`/alternativa legada para ler dados históricos até a migração.
3. Aplicar as migrações Drizzle `0068_nfse_requests.sql`, `0069_nfse_custody_events.sql` e `0070_nfse_rejected_attempts.sql` pelo fluxo habitual, primeiro em banco isolado. Nenhuma foi aplicada ao banco conectado ou à produção nesta tarefa.
4. Abrir `/financeiro/nfse` com permissão financeira. Configuração de certificado exige também `integrations.manage`. Emissão e consulta exigem `finance.manage`; visualização e download exigem `finance.read`.
5. Cadastrar dados fiscais e A1 em ambiente de homologação. A conferência local abre o PKCS#12, encontra a chave RSA correspondente ao certificado, verifica validade, uso de autenticação de cliente e CNPJ em otherName ICP-Brasil (2.16.76.1.3.3). Não substitui validação de cadeia ou revogação: a aceitação pelo governo ainda precisa ser comprovada.

## Cenário suportado pelo piloto

Simples Nacional ME/EPP com tributos federais e municipais dentro do Simples; operação tributável; prestação no município da clínica; sem retenções, descontos, deduções, benefícios ou regime especial. O usuário informa código nacional, código municipal e NBS quando exigidos, competência e percentual aproximado total dos tributos conforme orientação contábil. O pagador pode diferir do paciente; os campos devem ser revisados.

O grupo IBS/CBS não é gerado. Operações que o exijam, outros regimes e regras municipais específicas dependem de implementação e homologação próprias. Não usar o piloto para presumir o enquadramento fiscal de uma clínica. A série de DPS é configurável entre 1 e 49999, faixa para aplicativos próprios; valor inicial 1. O contador deve confirmar uma série exclusiva para evitar colisões com outros emissores. A antiga série 80001 não deve ser usada pelo aplicativo próprio.

O foco inicial informado é clínicas de estética em Salvador (IBGE 2927408) e Lauro de Freitas (2919207). Não há ainda clínica piloto, regime ou A1 definidos. Essas cidades são sugestões de cadastro, sem declaração de cobertura. Validar habilitação individual, inscrição, códigos municipais, enquadramento de cada procedimento e exigências atuais; não presumir que toda clínica de estética usa o mesmo código nacional.

## Garantias operacionais

- Uma solicitação não rejeitada por organização, recebimento e ambiente, com unicidade adicional da DPS por ambiente no banco. Rejeições definitivas reconhecidas permitem outra tentativa, preservando o histórico; resultado desconhecido não permite novo envio.
- Bloqueio do recebimento na preparação e na confirmação; conferência de titularidade, situação e valor. Nota externa já registrada impede emissão vinculada ao mesmo recebimento.
- Atualização condicional de `draft` para `processing`, verificando também o rascunho revisado. Dois cliques concorrentes não originam dois envios.
- DPS assinada persistida criptografada antes da chamada externa. O número é preservado mesmo se a conexão falhar.
- Depois de um envio, cliques subsequentes fazem consultas, sem repetir POST nem trocar de fornecedor. Falhas, 404 e respostas desconhecidas permanecem pendentes de consulta/análise. Somente HTTP 400 com identidade exata da DPS e códigos de rejeição definitiva verificados libera correção. Não liberar outra DPS para contornar um resultado desconhecido.
- Autorização exige XML recebido pelo canal autenticado e correspondência de DPS, CNPJ, ambiente e valor. O XML é armazenado criptografado e baixado somente pela organização, com cache privado desativado.
- A tela identifica homologação, vencimento do A1 e registros externos. Notas de teste não entram no contador comercial de produção.

## Verificação local

`npm run test:nfse` testa certificado e senha, assinatura e adulteração, escaping, identidade da DPS, cenários suportados, isolamento entre organizações, unicidade, concorrência, recuperação após timeout e recusa de XML de outra solicitação. A migração real é executada no PGlite isolado.

Para validar também o XML assinado no Windows, baixar e extrair o pacote oficial XSD 1.01 e executar:

```powershell
$env:NFSE_XSD_FIXTURE = 'tmp/nfse-dps-fixture.xml'
npm run test:nfse
./scripts/verify-nfse-xsd.ps1 -SchemaDirectory 'tmp/nfse-schemas/Schemas/1.01' -XmlPath 'tmp/nfse-dps-fixture.xml'
```

## Próximas condições para lançamento

Homologar com A1 real e município escolhido: contrato autenticado dos parâmetros municipais, emissão, recuperação após timeout, rejeição e cancelamento (incluindo caminhos e campos do evento retornado). Confirmar assinatura SHA-256, série, leiaute e regras vigentes com o ambiente oficial. Cancelamento e exportação ZIP estão implementados e testados localmente; isso não comprova aceitação pelo governo. Continuam pendentes substituição, DANFSe local conforme modelo vigente, entrega ao paciente e acesso específico do contador; tratar IBS/CBS e demais cenários necessários. A API governamental de DANFSe foi suspensa em julho de 2026 conforme NT 008, portanto o PDF precisa de implementação local e verificação visual. Não há endpoint PDF implementado neste piloto. Depois, habilitar produção mediante validação fiscal e comercial da clínica.

## Custódia, recuperação e operação

- A criptografia vincula o conteúdo à clínica e ao objeto; XML, DPS, rascunho e eventos usam contextos separados. A1 legado precisa de migração ou novo cadastro antes de ser utilizado. O uso exige autorização explícita registrada no cadastro.
- Conferir a migração sem escrita: `npx tsx scripts/migrate-nfse-custody.ts --organization=<uuid>`. Após backup recuperável e teste isolado, adicionar `--apply`. A operação é transacional e limitada à clínica informada. Não executada no banco conectado nesta tarefa.
- Rotação: adicionar uma nova chave mantendo as antigas, mudar o identificador ativo, conferir e aplicar migração por clínica. Não sobrescrever o material de uma chave existente. Restaurar backup junto do conjunto de chaves correspondente em ambiente isolado e verificar leitura antes de considerar a recuperação validada.
- A remoção do A1 interrompe novos usos pelo cadastro ativo; não revoga o certificado na certificadora nem impede conclusão de operação já iniciada. Backups precisam de política própria de retenção e descarte.
- Mudanças de estado e seus eventos são transacionais. Downloads e exportações geram histórico, sem registrar conteúdo fiscal ou credenciais no log. O histórico na tela é recente e limitado; não representa auditoria completa pesquisável.
- ZIP: seleção pela criação da solicitação em UTC, até 31 dias, 500 notas e 25 MB. Inclui XML autorizado, evento confirmado quando existente e manifesto com status observado por documento. Não é uma fotografia transacional de todos os documentos nem exportação por competência.
- Antes da produção: testar recuperação real de backup, alertas operacionais/vencimento, monitoramento de consumo, resposta a incidente e manutenção das chaves. Custódia implementada não equivale a certificação ou validação de conformidade.

## Referências oficiais consultadas

- [Manuais e XSD atuais](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual)
- [Endereços de APIs de homologação e produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao)
- [Manual do contribuinte da API](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf)

As especificações autenticadas não puderam ser consultadas sem certificado (HTTP 403). Por isso a implementação é um piloto sujeito à validação dos contratos e respostas reais, e não uma declaração de cobertura nacional.
