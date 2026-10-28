# Camaçari — base técnica para emissão de NFS-e

Pesquisa em 27/10/2026. Levantamento documental; não houve autenticação com certificado, teste de transmissão ou implementação do conector municipal.

## Classificação e canal

A Focus classifica Camaçari (IBGE 2905701) como provedor Próprio, formato Próprio (ABRASF), autenticação por certificado digital, produção disponível e cancelamento ativo. A Focus informa homologação indisponível em seu serviço.

Fonte: https://focusnfe.com.br/guides/nfse/municipios-integrados/camacari-ba/

A prefeitura orienta contribuintes sujeitos ao STM a continuar emitindo pelo sistema municipal. A integração ao Ambiente de Dados Nacional (ADN) compartilha as notas municipais; não equivale, isoladamente, à adoção do Emissor Nacional para todos os contribuintes.

Fontes:
- https://sefaz.camacari.ba.gov.br/portal-nfse-sefaz-camacari/
- https://sefaz.camacari.ba.gov.br/wp-content/uploads/2026/07/COMUNICADO-AOS-CONTRIBUINTES-NFSE-NACIONAL.pdf

## Contrato técnico publicado

Manual municipal de 2025, com 48 páginas:
https://sefaz.camacari.ba.gov.br/wp-content/uploads/2023/03/Manual-WebserviceSEFAZ_2025.pdf

Descreve XML baseado em ABRASF, serviços web com contrato WSDL e autenticação com certificado ICP-Brasil. Operações documentadas: envio síncrono de lote de RPS, geração individual de NFS-e, cancelamento, substituição e consultas por RPS, serviços prestados e serviços tomados/intermediados. Limite de XML: 512 KB.

Endereços publicados pela prefeitura:
- Produção: https://nfse.camacari.ba.gov.br/nfse/ws
- Treinamento: https://201.18.232.29/nfse/ws

Fonte: https://sefaz.camacari.ba.gov.br/wp-content/uploads/2022/09/Endereco-para-WebService-de-NFSe-2025.pdf

A publicação de treinamento pela prefeitura diverge da ausência de homologação na oferta Focus. Não presumir que o treinamento está operacional ou liberado para o Aggenda. Confirmar endpoint atual, acesso autorizado e validade TLS, sobretudo por se tratar de endereço IP; não desabilitar validação TLS para contornar falhas.

## Adequação ao leiaute de 2026

O comunicado municipal identifica o arquivo nfse_v02.02.xsd e acrescenta ao tipo tcDadosServico informações de NBS, indicador de operações e classificação tributária NBS (IBS/CBS). Obter o pacote atualizado e seus exemplos antes de implementar. Os nomes descritivos não comprovam os nomes exatos das tags XML; não copiar automaticamente as tags de Salvador ou do padrão nacional.

O manual também registra que CNAE não é utilizado, que o regime deve coincidir com o cadastro municipal e que determinados valores/alíquotas de ISS são calculados ou determinados pela prefeitura. Não inferir alíquota aplicável de exemplos de integração.

## Separação por regime e vigência

- MEI: canal nacional nas operações abrangidas, conforme regras federais vigentes desde setembro de 2023.
- ME/EPP optante pelo Simples Nacional: a Resolução CGSN 191/2026 determina o uso do Emissor Nacional web/API, com efeitos em 01/11/2026. Confirmar habilitação e tratamento das competências na transição. A resolução revoga a CGSN 189/2026; não utilizar o prazo anterior como referência atual.
- Lucro Presumido e Lucro Real sujeitos ao STM: adotar como referência o canal municipal, observando cadastro, operação e atualizações da prefeitura.

Fontes:
- https://www.gov.br/nfse/pt-br/noticias/resolucao-cgsn-no-169-traz-novos-beneficios-ao-mei
- https://sefaz.camacari.ba.gov.br/wp-content/uploads/2026/08/Resol.-CGSN-n-191-2026-Revoga-a-Res.-CGSN-n-189-2026.pdf

O comunicado municipal sobre continuidade do STM deve ser interpretado conforme regime e vigência; não anula as regras federais específicas de MEI e Simples.

## Implicações para o Aggenda

Criar adaptador municipal específico para Camaçari, com seu contrato, assinatura XML, envio síncrono, consultas, cancelamento/substituição e tratamento de erros. Não considerar compatível com Salvador apenas por ambos citarem ABRASF.

Antes de habilitar emissão: obter WSDL/XSD vigentes e exemplos de 2026; confirmar certificado aceito, titularidade/procuração e autorização municipal; validar treinamento com empresa autorizada; testar emissão, consulta, duplicidade de RPS, cancelamento e substituição. O A1 é o formato operacional pretendido para a automação do Aggenda, mas este levantamento não comprova sozinho todas as regras de aceitação municipal de certificados.

A seleção de canal precisa considerar município, regime e data. O fallback genérico para o canal nacional não comprova cobertura de Camaçari.

## Desenvolvimento realizado

- Município incluído na preparação fiscal e nas referências da interface, com os quatro regimes.
- Canal próprio `camacari` para Lucro Presumido/Real e para Simples ME/EPP antes de 01/11/2026 às 00h de Bahia; MEI segue nacional. A partir dessa data o Simples segue nacional. A seleção continua sujeita ao cadastro e à habilitação individual.
- Guarda no servidor e no gerador de DPS impede o uso do canal nacional por perfis municipais de Camaçari.
- Estrutura interna de transporte em `src/lib/nfse/camacari/transport.ts`: mTLS com PFX, TLS validado, SOAP 1.1/1.2, limite de 512 KB, rejeição de entidades XML, timeout, resposta limitada e ausência de reenvio automático.
- Contrato independente exige revisão do WSDL, confirmação do treinamento, aceitação do leiaute de 2026 e hash SHA-256 do XSD. Operações previstas: envio síncrono, consulta por RPS, cancelamento e substituição.
- O transporte exige validação de esquema/assinatura antes de abrir conexão. Nenhuma ação de emissão da interface chama esse transporte nesta etapa.

`NFSE_CAMACARI_SANDBOX_ENABLED=true` e `NFSE_CAMACARI_SOAP_CONTRACT` são configurações internas futuras; não configurar enquanto o contrato real não for conferido. O transporte suporta parâmetros de XML serializado em SOAP; eventual cabeçalho ou outro formato exigido pelo WSDL deve ser implementado após sua obtenção, sem adaptar o contrato por suposição.

Ainda faltam o gerador e a assinatura do XML municipal de 2026, validação contra os XSDs reais, interpretação fiscal dos retornos, persistência/custódia das solicitações e ações autorizadas na interface. Esses componentes não foram substituídos por XML de Salvador ou DPS nacional.

Durante o desenvolvimento, o domínio dos exemplos publicados (`arquivos.camacari.ba.gov.br`) não resolveu DNS no ambiente de trabalho. Os downloads apresentados como exemplos pela página também direcionam para PDFs de esquemas antigos. O WSDL é documentado como dependente de certificado ICP-Brasil. Portanto, o contrato atual não foi obtido e a cidade permanece sem emissão municipal habilitada ou homologada.
