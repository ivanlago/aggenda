param([Parameter(Mandatory = $true)][string]$XmlPath)
$ErrorActionPreference = 'Stop'
$taskSchemas = Join-Path $PSScriptRoot '../resources/nfse/salvador'
$taskSettings = [System.Xml.XmlReaderSettings]::new()
$taskSettings.ValidationType = [System.Xml.ValidationType]::Schema
$taskSignatureSettings = [System.Xml.XmlReaderSettings]::new()
$taskSignatureSettings.DtdProcessing = [System.Xml.DtdProcessing]::Ignore
$taskSignatureReader = [System.Xml.XmlReader]::Create((Join-Path $taskSchemas 'xmldsig-core-schema20020212.xsd'), $taskSignatureSettings)
try { [void]$taskSettings.Schemas.Add('http://www.w3.org/2000/09/xmldsig#', $taskSignatureReader) }
finally { $taskSignatureReader.Dispose() }
[void]$taskSettings.Schemas.Add('http://www.abrasf.org.br/ABRASF/arquivos/nfse.xsd', (Join-Path $taskSchemas 'nfse_salvador.xsd'))
$taskSettings.add_ValidationEventHandler({ param($sender, $event) throw $event.Message })
$taskReader = [System.Xml.XmlReader]::Create((Resolve-Path -LiteralPath $XmlPath).Path, $taskSettings)
try { while ($taskReader.Read()) {} }
finally { $taskReader.Dispose() }
Write-Output 'XML validado contra o XSD municipal publicado de Salvador. Isso não confirma aceitação no servidor ou homologação fiscal.'
