# Lauro de Freitas — base técnica para implementação

Pesquisa de 27/10/2026. Este documento acrescenta evidências oficiais à classificação da Focus. Não habilita transmissão nem certifica cobertura individual de qualquer CNPJ.

## 1. Adesão ao Emissor Nacional confirmada em fonte federal

Fonte publicada em https://www.gov.br/nfse/pt-br/municipios/monitoramento-adesoes:

https://www.gov.br/nfse/pt-br/municipios/monitoramento-adesoes/municipios-aderentes-20260928.xlsx

Registro conferido na aba `Plan1`, linha 802:

| Campo | Valor |
| --- | --- |
| UF / NomeMunicipio | BA / LAURO DE FREITAS |
| StatusConvenioSEFIN | Conveniado Ativo |
| AderenteAmbienteNacional | Sim |
| AderenteEmissorNacional | Sim |
| AderenteMAN | Não |
| AtivoNaBase / AtivoUltimoPeriodo | Sim / Sim |
| Início de Vigência | 18/11/2025 |

Esta evidência confirma adesão municipal ao emissor público, além do simples compartilhamento com o ADN. Não confirma por si só a habilitação individual, a aceitação de todos os regimes em cada ambiente, o cronograma de desativação do Metrópolis ou a disponibilidade do serviço no momento de um teste.

## 2. Regra municipal de códigos

Decreto municipal nº 5.565, de 13/11/2025, exige cTribNac de seis dígitos a partir de 01/12/2025 e traz a tabela no anexo. O código de serviços sem incidência de ISSQN/ICMS depende de autorização prévia conforme o decreto. Não inferir que a adoção de códigos nacionais, isoladamente, comprova migração do canal de emissão.

Fonte: https://sefaz.laurodefreitas.ba.gov.br/legislacao/arquivos/decreto_5565_2025.pdf

## 3. Documentação pública municipal alternativa

O portal municipal Metrópolis mantém links para manual de emissão, informações de webservice e `nfse.xsd`:

- https://lftributos.metropolisweb.com.br/metropolisWEB/
- https://lftributos.metropolisweb.com.br/metropolisWEB/nfe/manuais/Informacoes-sobre-Web-Service.pdf
- https://lftributos.metropolisweb.com.br/metropolisWEB/nfe/manuais/nfse.xsd

O documento de webservice descreve habilitação do portal seguida de solicitação específica de acesso ao webservice, com CNPJ, razão social e CGA/IM. Prevê confirmação por e-mail para homologação e/ou produção e, quando aplicável, conclusão dos testes antes da liberação de produção.

Esse documento é antigo e lista WSDLs HTTP na porta 9090 e materiais na porta 8181. A existência documental não prova que os endereços, contatos ou requisitos continuam vigentes. Não usar tais URLs para enviar certificados, dados fiscais ou notas sem confirmar os destinos HTTPS e a documentação atual com o provedor/prefeitura. Não houve solicitação de habilitação ou mensagem externa nesta pesquisa.

## 4. Caminho recomendado de desenvolvimento

Priorizar o canal nacional para Lauro de Freitas, apoiado na adesão oficial. A base existente do Aggenda já dispõe de transporte nacional, certificado, assinatura, custódia, consultas e eventos; o gerador agora abrange MEI, Simples ME/EPP, Lucro Presumido e Lucro Real em cenários definidos. Consulte `nfse-regimes-tributarios.md`.

Foram implementados indicadores por regime, totalização adequada, apuração própria explícita de PIS/COFINS para não optantes, endereço nacional e campos básicos de IBS/CBS. Retenções e operações especiais permanecem fora do cenário coberto. O teste real inicial em Lucro Presumido não limita os regimes preparados.

Documentação oficial de produção, XSDs, anexos de leiaute e domínios:

- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf

Confirmar a habilitação e o canal do CNPJ participante antes de transmitir. Se o cenário real ainda exigir Metrópolis, obter WSDL/XSD, endpoints HTTPS e requisitos de liberação atualizados para construir um adaptador municipal separado. Não reutilizar o conector de Salvador apenas porque os dois possuem referências ABRASF.

## 5. Insumos para validação individual

CNPJ, IM, regime, serviço/cTribNac, CNAE/NBS quando exigidos, alíquotas, retenções e códigos IBS/CBS conferidos com o contador. Uma nota recente em XML e a identificação do portal atualmente utilizado ajudam a confirmar o canal. O A1 e a senha devem ser cadastrados por fluxo protegido, nunca por chat. As validações locais precedem qualquer transmissão de homologação.

Este levantamento não modifica o código emissor ou ambientes externos e não libera emissão real.
