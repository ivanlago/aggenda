# Conector municipal direto — Salvador

Implementado localmente, ainda sem transmissão real ou homologação com a Sefaz. Não exige contratação da Focus. O catálogo Focus continua sendo referência comercial de classificação; o transporte deste conector é direto para a prefeitura.

MEI e Simples ME/EPP seguem o canal nacional, sujeito à habilitação e transição. A matriz de cobertura e limites está em `nfse-regimes-tributarios.md`.

## Escopo implementado

- Geração de XML de lote com um RPS, identificação e numeração informadas pelo operador e assinatura XMLDSig no RPS e no lote.
- Primeiro cenário: CNPJ de Salvador no Lucro Presumido ou Lucro Real, operação tributável no município, ISS explicitamente informado entre 2% e 5%, sem retenções, descontos, deduções, incentivos, regime especial, construção civil ou atividade portuária. Não presumir que esse cenário atende todos os serviços de uma clínica.
- O gerador inclui os três campos do schema IBS/CBS atual: `NBS`, `cClassTrib` e `INDOP`, informados explicitamente pelo operador. Não calcula ou presume códigos de classificação pelo regime/CNAE. A aceitação das combinações e a tributação efetiva dependem da conferência fiscal e homologação.
- SOAP 1.1/1.2, mTLS com A1, tempo e tamanho de resposta limitados, destino de rede fixo no host oficial de homologação. A ação, namespace, operação, parâmetro e resultado devem vir do WSDL conferido; nenhum contrato WCF foi inventado como padrão funcional.
- Envio do lote e consulta da nota por RPS. Também há geração de consulta de lote/situação por protocolo e operações correspondentes no transporte, para integração após validação do contrato.
- Rascunho, reserva do RPS, vínculo ao recebimento, assinatura e autorização em `nfse_requests`, com dados privados na custódia fiscal existente. Identificadores municipais têm prefixo `SSA_`; os serviços nacional e municipal recusam solicitações do outro canal.
- Um clique concorrente não reenvia o lote. Timeout, SOAP Fault, resposta desconhecida, duplicidade ou retorno fiscal não conclusivo preservam estado incerto e levam à consulta do mesmo RPS. Apenas localizar uma nota correspondente ao CNPJ, IM, RPS, pagador, órgão gerador e valor confirma autorização.
- Códigos de retorno limitados são exibidos; mensagens integrais potencialmente contendo dados fiscais/pessoais não são copiadas para logs. Erros municipais não liberam automaticamente uma nova emissão ou mudança de número. O fluxo de correção/reenvio de RPS rejeitado ainda exige análise e desenvolvimento próprio.
- XML autorizado pode ser baixado e exportado pela infraestrutura existente. Não há cancelamento pelo webservice: a interface orienta usar o portal/prefeitura. Não há geração municipal de DANFSe neste conector.

## Bloqueios e configuração de homologação

O WSDL de homologação não foi obtido nesta etapa: o host antigo `nfsehml.sefaz.salvador.ba.gov.br` não resolveu; o endereço atual `https://notahml.salvador.ba.gov.br/rps/ENVIOLOTERPS/EnvioLoteRPS.svc?wsdl` respondeu HTTP 403 sem certificado. Não foi possível confirmar SOAPAction, binding, namespaces e nomes exatos dos parâmetros/resultados. O transporte aponta para o host atual, com os caminhos municipais de RPS. O XSD IBS/CBS indicado no portal atual foi obtido e incorporado. Antes de liberar transmissão, é obrigatório confirmar o contrato e a aceitação desse cenário em homologação. Não preencher os indicadores de revisão abaixo sem essa conferência.

Sem as duas variáveis abaixo válidas, a interface permite salvar rascunhos com certificado cadastrado, mas não oferece envio/consulta. As ações no servidor repetem esse bloqueio:

- `NFSE_SALVADOR_SANDBOX_ENABLED=true`
- `NFSE_SALVADOR_SOAP_CONTRACT`: JSON conforme `salvadorContractSchema`, com `soapVersion` (`1.1` ou `1.2`), `reviewedForSandbox: true`, `layout2026AcceptedForSandbox: true` e quatro objetos: `send`, `byRps`, `batch`, `batchStatus`. Cada objeto contém `namespace`, `action`, `request`, `parameter`, `response` e `result`, extraídos do WSDL autenticado. São configurações técnicas, não credenciais de usuário. Não aceitar URLs de destino fornecidas pelo cliente.

Exige ainda custódia fiscal (`NFSE_STORAGE_KEYS` e `NFSE_STORAGE_ACTIVE_KEY`), perfil fiscal com A1 válido autorizado e integração em sandbox/configurada. Revogação, outro CNPJ/município/regime ou ambiente de produção impedem a operação. As credenciais não devem ser enviadas pelo chat. Não houve alteração em configurações externas, liberação em produção ou migração de banco nesta etapa.

## Roteiro para homologação real

1. Solicitar acesso de homologação à Sefaz com CNPJ, CGA/IM, razão social, contato e identificação do desenvolvedor, conforme o FAQ municipal. Confirmar o contato e os procedimentos atuais com o contador/Sefaz.
2. Confirmar habilitação do emissor, vinculação do certificado e faixa/série de RPS. Evitar colisão com os outros emissores da empresa. Os IDs de lote internos do Aggenda também precisam ser aceitos para o contribuinte no ambiente municipal.
3. Obter os WSDLs e XSDs vigentes. Conferir versão SOAP, parâmetros, assinaturas, algoritmos e exigências de IBS/CBS. A assinatura SHA-1 está isolada no conector legado porque é a que consta no manual publicado; confirmar a política efetiva antes de habilitar.
4. Rever a tributação do cenário com o contador, incluindo incidência de retenções federais. Não usar o piloto sem retenções em operações que as exijam.
5. Habilitar somente homologação e testar autorização, rejeição, timeout, recuperação, consulta e download. Validar também um recebimento já usado e RPS duplicado para confirmar que não ocorre emissão repetida.
6. Implementar os cenários fiscais adicionais e a emissão real apenas depois da conferência técnica e fiscal. A implementação atual bloqueia produção incondicionalmente.

## Fontes e verificação local

- FAQ municipal: https://nfse.sefaz.salvador.ba.gov.br/OnLine/Institucional/FaqTecnologia.aspx
- Manual: https://nfse.sefaz.salvador.ba.gov.br/OnLine/Documentos/ABRASF%20-%20Manual%20de%20Integracao.pdf
- Schemas: https://nfse.sefaz.salvador.ba.gov.br/OnLine/Documentos/XSD.zip
- Schema atual IBS/CBS: https://nota.salvador.ba.gov.br/arquivos/schema/nfse_salvador.zip
- Referência Focus: https://focusnfe.com.br/guides/nfse/municipios-integrados/salvador-ba/

Os schemas oficiais obtidos estão em `resources/nfse/salvador`, sem alterações. `npm run test:nfse` cobre assinaturas, XML/XSD, SOAP, persistência, concorrência, isolamento entre clínicas e canais, recuperação e bloqueio de produção. O verificador XSD usa PowerShell; a validação local não substitui a aceitação da prefeitura.
