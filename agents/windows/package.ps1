$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build.ps1')
$distributionPath = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $distributionPath -Force | Out-Null
$executablePath = Join-Path $PSScriptRoot 'bin/Aggenda.SignPilot.exe'
$archivePath = Join-Path $distributionPath 'Aggenda.Assinador.zip'
Compress-Archive -LiteralPath $executablePath,(Join-Path $PSScriptRoot 'LEIA-ME.txt') -DestinationPath $archivePath -Force
$digest = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $distributionPath 'SHA256.txt') -Value "$digest  Aggenda.Assinador.zip"
Write-Output "Pacote preparado: $archivePath"
Write-Output "SHA-256: $digest"
