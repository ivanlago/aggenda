# Esquemas municipais publicados de Salvador

Schema principal atual: https://nota.salvador.ba.gov.br/arquivos/schema/nfse_salvador.zip

Dependência XMLDSig: https://nfse.sefaz.salvador.ba.gov.br/OnLine/Documentos/XSD.zip

Obtidos em 27/10/2026. Mantidos sem alterações para validação local do lote e das consultas. O pacote atual, indicado na seção IBS/CBS do portal municipal, mantém o namespace ABRASF e exige `NBS`, `cClassTrib` e `INDOP`. Sua aceitação para o cenário de homologação precisa ser confirmada pela Sefaz antes de habilitar transmissão. Não tratar a validação XSD como homologação.

SHA-256 de `nfse_salvador.xsd`: `BD89095AAD3986AF91B3562AF01B83C35DE51D1E35861109D9384F64B276771B`.

Verificação local: `pwsh -File scripts/verify-salvador-xsd.ps1 -XmlPath CAMINHO_DO_XML`.
