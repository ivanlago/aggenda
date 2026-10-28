# Preparação fiscal regional

Escopo inicial: empresas de Salvador (IBGE 2927408) e Lauro de Freitas (2919207). Referência consultada em 27/10/2026: classificação técnica publicada pela Focus NFe. Não representa contratação da Focus ou integração já homologada no Aggenda.

| Município | Referência atual da Focus | Particularidades |
| --- | --- | --- |
| Salvador | Próprio / Próprio (ABRASF) | Certificado digital; cancelamento pelo portal ou prefeitura, sem cancelamento pelo webservice da Focus. CPF/CNPJ e endereço do tomador, item da lista e CNAE obrigatórios segundo o guia. Conferir campos fiscais de IBS/CBS. |
| Lauro de Freitas | A URL municipal redireciona ao guia do Ambiente Nacional | Referência anterior: Metrópolis / Próprio (ABRASF). Confirmar canal e habilitação do CNPJ antes de homologar. A integração nacional utiliza DPS; o guia prevê cancelamento conforme regras aplicáveis. |

Fontes:

- https://focusnfe.com.br/guides/nfse/municipios-integrados/salvador-ba/
- https://focusnfe.com.br/guides/nfse/municipios-integrados/lauro-de-freitas-ba/
- https://focusnfe.com.br/guides/nfse/municipios-integrados/municipios-da-nfse-nacional/

## Comportamento implementado

- `/financeiro/nfse` permite salvar CNPJ, município, regime e inscrição municipal opcional, sem certificado. A permissão exigida é `integrations.manage`; a consulta da página continua exigindo `finance.read`.
- A preparação fica em `organizationFinancialIntegrations.metadata.fiscalOnboarding`. Não substitui `fiscalProfile`, custódia, consentimento, credenciais, ambiente, status ou rotas de uma integração existente. Sem integração anterior, cria somente uma solicitação em sandbox com credencial de marcador criptografada, sem certificado.
- O catálogo municipal é consultivo. Não escolhe transportes, não confirma habilitação e não ativa produção. MEI e Simples recebem orientação sobre o canal nacional e a transição; não se altera automaticamente o emissor em função de prazo ou seleção na URL.
- O registro de notas externas continua disponível. As informações comerciais e o escopo inicial também aparecem em Administração → Assinaturas, mantendo contratação fiscal bloqueada até homologação.

## Trabalho necessário para emitir

1. Confirmar o canal efetivo de cada CNPJ, seu credenciamento e o regime com a prefeitura/provedor; revisar as fontes, especialmente a mudança da referência de Lauro de Freitas.
2. Escolher integração direta ou fornecedor. Para usar a Focus, ainda é necessário contratar/configurar conta, credenciais de API, empresas e ambientes. O catálogo não envia dados à Focus.
3. O conector direto de Salvador agora tem uma implementação inicial restrita de RPS, assinatura, envio/consulta e cancelamento externo. Ainda exige validar WSDL e leiaute, configurar acesso e homologar. Consulte `nfse-salvador-conector.md`. Para o canal nacional, validar a DPS e as particularidades do contribuinte.
4. Implementar os enquadramentos ainda ausentes: MEI, Lucro Presumido e Lucro Real, incluindo tributação, retenções e IBS/CBS aplicáveis. O gerador atual continua restrito ao cenário inicial de ME/EPP do Simples.
5. Homologar assinatura, envio, rejeição, recuperação após timeout, consulta, XML/DANFSe e cancelamento no canal permitido. Só então liberar a contratação e a emissão real.

Nenhuma migração nova é necessária para o cadastro preparatório. Nenhuma chamada de emissão ou contratação externa é realizada ao salvá-lo.
