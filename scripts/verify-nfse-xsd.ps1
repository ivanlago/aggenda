param(
  [Parameter(Mandatory = $true)][string]$SchemaDirectory,
  [Parameter(Mandatory = $true)][string]$XmlPath
)
$ErrorActionPreference = 'Stop'
$schemaRoot = (Resolve-Path -LiteralPath $SchemaDirectory).Path
$settings = [System.Xml.XmlReaderSettings]::new()
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.Schemas.XmlResolver = [System.Xml.XmlUrlResolver]::new()
# The official XMLDSig XSD contains a public DTD declaration. Ignore that DTD;
# validation resolves only the local official schema files supplied above.
$signatureSettings = [System.Xml.XmlReaderSettings]::new()
$signatureSettings.DtdProcessing = [System.Xml.DtdProcessing]::Ignore
$signatureReader = [System.Xml.XmlReader]::Create((Join-Path $schemaRoot 'xmldsig-core-schema.xsd'), $signatureSettings)
try { [void]$settings.Schemas.Add('http://www.w3.org/2000/09/xmldsig#', $signatureReader) }
finally { $signatureReader.Dispose() }
[void]$settings.Schemas.Add('http://www.sped.fazenda.gov.br/nfse', (Join-Path $schemaRoot 'DPS_v1.01.xsd'))
$settings.add_ValidationEventHandler({ param($sender, $event) throw $event.Message })
$reader = [System.Xml.XmlReader]::Create((Resolve-Path -LiteralPath $XmlPath).Path, $settings)
try { while ($reader.Read()) {} }
finally { $reader.Dispose() }
Write-Output 'DPS validada contra XSD oficial 1.01.'
