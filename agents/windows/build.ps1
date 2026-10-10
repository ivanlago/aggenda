$ErrorActionPreference = 'Stop'
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Compilador .NET Framework nao encontrado.' }
$outputDirectory = Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$outputPath = Join-Path $outputDirectory 'Aggenda.SignPilot.exe'
& $compilerPath /nologo /target:winexe /optimize+ /reference:System.Security.dll /reference:System.Windows.Forms.dll /reference:System.Core.dll "/out:$outputPath" (Join-Path $PSScriptRoot 'SignPreparedPdf.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar agente.' }
Write-Output $outputPath
