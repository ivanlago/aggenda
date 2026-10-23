# Assinatura profissional — piloto Windows

Atualização: 22/10/2026. Implementação do caminho local concluída; aceitação com e-CPF real e validação externa ainda pendentes. Não confundir com a assinatura eletrônica do paciente por desenho/OTP.

## Escopo entregue

- Receituário simples e solicitação de exames, emitidos pelo médico com CRM/UF cadastrado e usuário próprio vinculado. O cadastro do CRM não consulta automaticamente a situação do registro no conselho.
- `/documentos/assinatura-profissional`, acessível pelo menu Atendimento e pelo histórico; lista documentos do próprio profissional.
- Identidade/CPF conferida e cadastrada pelo administrador da clínica. O signatário nunca é escolhido livremente pelo navegador: deve ser o emissor e o usuário autenticado.
- PDF congelado, preparado PAdES e armazenado privado com AES-256-GCM. Identificador aleatório embutido nos bytes assinados impede usar uma assinatura anterior em uma nova autorização.
- Código de uso limitado enviado ao e-mail da conta, validade de 20 minutos, até cinco tentativas por autorização e cinco preparações por hora. Autorização vinculada à sessão, organização, usuário, profissional, documento e hash. A senha/certificado privado não transitam no Aggenda.
- Assinador Windows com seleção de arquivo/certificado, conferência de hash/titular e consentimento explícito. Saída `.p7s` enviada na página autenticada; nenhuma porta local/protocolo de navegador é aberta.
- Servidor verifica CMS/SHA-256, ESS signingCertificateV2, cobertura exata do PDF, e-CPF em otherName, CPF cadastrado, vigência, política pessoal A1/A3, uso de chave, caminho até raízes públicas fixadas do ITI e LCR assinada vigente para cada certificado abaixo da raiz.
- Certificado de empresa, CPF divergente, cadeia desconhecida, revogação ou adulteração não produzem `SIGNED`. Repositórios indisponíveis mantêm a operação inconclusiva, sem aprovação permissiva.
- Arquivo final preservado e servido pelos downloads privados/públicos existentes, com conferência de hash/tamanho. Após iniciar a preparação, o download final não regenera uma versão sem assinatura.
- Receituários simples/exames do piloto encaminham a emissão para assinatura antes de compartilhar. Depois da validação, o titular pode enviar o PDF ao e-mail cadastrado do paciente. Reenvio limitado a um por dez minutos.
- Reserva/consumo da franquia de documentos com recurso único por documento; reenvio do mesmo resultado não duplica consumo. Cancelar uma autorização não revoga assinatura já produzida.

## Operação

1. Aplicar migrações `0082_professional_signing.sql`, `0083_signing_processing_lease.sql`, `0084_signing_session_binding.sql`. As tabelas das migrações 0066/0067 já precisam existir.
2. Configurar `SIGNATURE_STORAGE_KEYS` como JSON de chaves AES-256 em Base64 e `SIGNATURE_STORAGE_ACTIVE_KEY=v1`, exclusivamente no servidor. Preservar backup das chaves e não substituir material de um identificador existente.
3. Configurar `SIGNATURE_PILOT_ORGANIZATIONS` com UUIDs explícitos. Ausência da organização mantém a interface informativa e bloqueia preparação/assinatura. Nenhuma liberação geral é feita por padrão.
4. Compilar/empacotar com `agents/windows/package.ps1`. O ZIP de homologação e SHA-256 ficam em `agents/windows/dist`; a rota autenticada `/api/signatures/windows` entrega o pacote apenas ao piloto. A compilação não acessa certificados pessoais.
5. Administrador confere o CPF do profissional na página. O profissional deve estar ativo e vinculado a seu usuário, com CRM e UF cadastrados.
6. Profissional emite documento sintético, prepara, recebe código, baixa/revisa PDF, executa assinador, escolhe e-CPF e devolve o `.p7s` ao Aggenda para concluir.
7. Conferir o PDF resultante no VALIDAR do ITI, comparar titular, conteúdo e hash; repetir download e verificar mesmos bytes. Somente após a aceitação real avaliar a liberação clínica.

## Confiança e manutenção

Raízes v5, v6, v7, v12 e v13 obtidas em 22/10/2026 pelos links do [repositório oficial do ITI](https://www.gov.br/iti/pt-br/assuntos/repositorio/repositorio-ac-raiz), em `src/lib/signatures/trust/roots.json`. Fonte e SHA-256 acompanham cada certificado público. Raízes expiradas/revogadas e raízes SSL/código não foram incluídas. Atualizações devem conferir novamente a fonte oficial, finalidade, validade e revogação, com revisão do diff; o CMS recebido nunca acrescenta âncora confiável.

Consultas de LCR aceitam apenas HTTP/HTTPS públicos, sem credenciais, portas alternativas ou redirects. DNS é conferido e fixado para impedir SSRF/rebinding; há limites de tamanho e tempo. As LCRs são verificadas criptograficamente, incluindo emissor, período e serial. Perfil restrito: LCR base completa; delta, indireta, escopada ou somente OCSP mantêm a validação indisponível até suporte específico. Não há carimbo do tempo nem validação histórica/LTV. O caminho CMS precisa trazer os intermediários; nenhuma confiança é inferida do Windows.

Assinador: RSA/SHA-256, .NET Framework 4, uma assinatura, PDF até 10 MiB. A1 instalado é o alvo inicial; A3 compatível com Windows pode aparecer no seletor, mas exige teste próprio. O ZIP piloto não tem assinatura Authenticode; distribuição pública em escala requer uma entrega assinada. Não orientar desativação de proteções do Windows.

Sem integração em nuvem/mobile nesta entrega, sem prescrição controlada/antimicrobiana, SNCR ou integração com dispensação. Estes não são requisitos ocultos do teste local: são outros escopos.

## Verificações

`npm run test:signatures`: 41 testes, incluindo migrações reais em PostgreSQL isolado, isolamento entre organizações, autorização de uso único, disputa concorrente, criptografia CMS e cadeia/LCR com autoridade sintética, expiração, revogação, LCR forjada/indisponível, certificado sintético recusado pelas raízes de produção, integridade e replay. Certificados sintéticos são exclusivos dos testes.

`npx tsc --noEmit --pretty false` e ESLint dos arquivos alterados. Build de produção e inspeção da interface devem constar no registro de publicação.

Pendente externo: teste completo com certificado pessoal real, consultas à certificadora, comportamento do Windows do titular e validação do resultado no ITI. Não acessar/importar o certificado do cliente durante a implementação e não marcar homologação como concluída por testes sintéticos.
