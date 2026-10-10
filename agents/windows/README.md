# Agente Windows — piloto manual

Este executável é uma etapa de desenvolvimento, sem integração com a aplicação e sem instalador/atualização assinados. Não habilita assinatura ICP-Brasil em produção. Use documentos sintéticos no piloto. O CMS gerado precisa de validação independente de identidade, cadeia ICP, revogação, política e integridade antes de qualquer estado `SIGNED`.

## Compilar

No PowerShell, na raiz do projeto:

```powershell
& .\agents\windows\build.ps1
```

Usa o compilador do .NET Framework instalado no Windows. O resultado fica em `agents/windows/bin/Aggenda.SignPilot.exe`, ignorado pelo Git. Não exige instalação do SDK .NET. A compilação não executa o agente nem acessa certificados.

## Exercitar o ciclo manual

```powershell
npm run signature:pilot -- prepare entrada-sintetica.pdf preparado.pdf
& .\agents\windows\bin\Aggenda.SignPilot.exe "$PWD\preparado.pdf"
npm run signature:pilot -- embed preparado.pdf resultado.pdf preparado.pdf.p7s
```

Confira o conteúdo do PDF preparado antes de autorizar. O seletor lista certificados pessoais RSA com chave privada instalada no perfil atual, dentro da validade. Importe seu A1 usando os controles do Windows, sem disponibilizar arquivo PFX ou senha ao Aggenda. O agente não garante que o certificado escolhido seja A1: certificados com chave em hardware também podem aparecer. A validação do Windows, incluindo consulta online de revogação, é uma barreira preliminar; não comprova a política ICP-Brasil do servidor.

A confirmação mostra o caminho, titular e SHA-256 dos bytes preparados. `SignedCms` assina os intervalos do PDF usando SHA-256 e inclui `signingCertificateV2`. A saída é um CMS destacado `.p7s`; a ferramenta TypeScript o incorpora na reserva `Contents`, mantendo os outros bytes intactos. Arquivos existentes não são sobrescritos. O hash de vínculo é o do **PDF preparado**, que deve ser congelado/persistido antes da autorização, não o PDF anterior à preparação.

Essa ferramenta aceita somente uma assinatura, sem revisão incremental, e PDFs de até 10 MiB. Não oferece carimbo do tempo nem preservação de longo prazo. O comando `embed` confere a assinatura criptográfica CMS e o vínculo SHA-256 do certificado (`signingCertificateV2`) antes de salvar. A função `verifyDetachedPades` aceita certificado sintético/autossinado matematicamente válido: não verifica confiança ICP, CPF, validade, revogação ou política. Nenhuma dessas funções implementa sozinha `SignatureValidator` ou autoriza `SIGNED`.

## Antes da integração

Faltam o canal autenticado com desafio de uso único e proteção contra replay, vínculo à sessão/organização/profissional/documento, autenticação reforçada, extração/verificação do CPF do certificado, validação criptográfica e cadeia ICP com revogação, testes com certificado real e VALIDAR do ITI, instalador e atualizações assinados. Nenhuma porta local é aberta por este piloto. Mobile permanece dependente da integração com certificado em nuvem.
