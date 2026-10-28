# Schemas oficiais da NFS-e Nacional

Origem: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip

Obtidos em 27/10/2026, diretório `Schemas/1.01`. Arquivos originais, sem alterações: `DPS_v1.01.xsd`, `tiposComplexos_v1.01.xsd`, `tiposSimples_v1.01.xsd`, `xmldsig-core-schema.xsd`.

Usados pelos testes dos quatro regimes disponíveis. A validação estrutural não confirma habilitação do CNPJ, regras de negócio, correção contábil ou homologação real.

Verificação: `pwsh -File scripts/verify-nfse-xsd.ps1 -SchemaDirectory resources/nfse/national -XmlPath CAMINHO_DO_XML`.
