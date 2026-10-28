# NFS-e — cobertura por regime e canal

Implementação local revisada em 27/10/2026. O teste real inicial pode usar Lucro Presumido, mas o desenvolvimento e a validação local abrangem os quatro regimes disponíveis no cadastro.

| Município | MEI | Simples ME/EPP | Lucro Presumido | Lucro Real |
| --- | --- | --- | --- | --- |
| Lauro de Freitas | Nacional | Nacional | Nacional | Nacional |
| Salvador | Nacional | Nacional, sujeito à transição/habilitação | RPS municipal | RPS municipal |

Esta matriz indica o canal preparado no código. A habilitação individual, os prazos de transição, a compatibilidade municipal e a aceitação fiscal ainda precisam ser confirmados. Produção permanece bloqueada. A classificação não liga serviços externos automaticamente.

## Tratamento nacional implementado

- MEI: `opSimpNac=2`, omite `regApTribSN`, inscrição municipal e grupo federal; utiliza `indTotTrib=0`.
- Simples ME/EPP: `opSimpNac=3`, `regApTribSN=1`, percentual aproximado do Simples informado explicitamente. O piloto não implementa apuração 2/3 nem sublimites excedidos.
- Presumido e Real: `opSimpNac=1`, sem `regApTribSN` ou `pTotTribSN`; PIS/COFINS e totalização aproximada federal/estadual/municipal informados pelo operador. Não inferir alíquotas fixas do regime.
- Para PIS/COFINS, CST 01/02 usa base e alíquotas explícitas e calcula os débitos com arredondamento em centavos. CST 06/07/08/09 não aceita base/percentuais adicionais. Tipos de CST fora desta seleção ainda não estão contemplados. O documento registra apuração própria sem retenção.
- Para a operação tributável local no município nacional ativo, sem retenção, não é declarada uma alíquota ISS estimada para não optantes; a parametrização municipal define o tratamento. O total aproximado municipal informado pelo usuário é transparência tributária, não substitui a alíquota de ISS.
- Endereço nacional do pagador foi acrescentado ao formulário. Para MEI, a IM não é enviada; para os demais regimes pode ser omitida quando ausente no CNC.
- IBS/CBS: operação regular, destinatário igual ao pagador, CST 000 ou 200, classificação compatível, indicador de operação e uso/consumo pessoal explícitos. NBS obrigatório ao informar o grupo. Competência anterior a 2026 não aceita esse grupo. No piloto não optante de 2026, esses dados são obrigatórios.

## Salvador

O adaptador municipal aceita Presumido e Real. Ambos são não optantes do Simples no XML ABRASF; o regime exato permanece no rascunho e no snapshot do emitente. MEI/Simples são recusados no RPS e orientados ao canal nacional, em vez de receberem flags municipais incorretas.

O RPS mantém ISS explícito entre 2% e 5%, códigos NBS/cClassTrib/INDOP e o cenário local sem retenções. Não foi inferida apuração federal do RPS por regime: o leiaute municipal e as obrigações contábeis correspondentes ainda precisam de validação com contador e prefeitura. O transporte continua dependendo do WSDL revisado e da habilitação de homologação descritos em `nfse-salvador-conector.md`.

## Limites comuns

O suporte aos regimes não significa suporte a todas as operações de cada regime. Continuam fora do escopo: retenções, descontos, deduções, benefícios, imunidade/exportação/não incidência, regime especial, serviços com complementos de construção/portos, destinatário diferente do pagador, diferimento, crédito presumido e outros grupos especiais de IBS/CBS. Os formulários exigem confirmação do cenário com o contador; campos fiscais não previstos são recusados pelos schemas de entrada.

Não há mudança de certificado exigido: os testes integrados usam A1 do CNPJ, com consentimento e custódia fiscal. Nenhuma credencial deve ser enviada por chat. Não houve transmissão, mudança de configuração externa, migração nova ou publicação nesta etapa.

## Histórico e proteção contra reclassificação

Novos rascunhos nacionais guardam `tax.regime` e snapshot de CNPJ, município, IM e regime em dados criptografados. Alterar o cadastro exige revisar o rascunho antes de transmitir; não há conversão automática de um regime em outro. O adaptador municipal mantém o snapshot equivalente e verifica o regime do RPS.

Rascunhos anteriores do Simples continuam legíveis. Na atualização do rascunho recebem o formato novo. O formato legado só pode ser interpretado como Simples com os campos originais; não pode ser reutilizado como MEI ou não optante.

## Evidência e validação

Fontes oficiais:

- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- Pacote XSD `nfse-esquemas_xsd-v1-01-20260209.zip`
- Anexo de leiaute e regras `anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx`
- Schema municipal IBS/CBS: https://nota.salvador.ba.gov.br/arquivos/schema/nfse_salvador.zip

Schemas nacionais originais de DPS, tipos complexos/simples e XMLDSig estão em `resources/nfse/national`. Testes verificam os indicadores por regime, omissão dos grupos indevidos, base e cálculo de PIS/COFINS, dados obrigatórios, bloqueio de combinações inválidas e de mudanças de regime, preservação do snapshot no banco e seleção do canal de Salvador. XMLs assinados dos quatro regimes nacionais e dos dois municipais são validados contra os respectivos XSDs oficiais. Isso não substitui homologação governamental de cada cenário.
