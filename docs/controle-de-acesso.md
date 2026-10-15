# Controle de acesso da Aggenda

## Contextos separados

A aplicação trata três públicos sem misturar seus vínculos:

1. Administração global do SaaS em `platform_members`.
2. Equipe das empresas em `organization_members`.
3. Consumidores finais em `clients`, com acesso próprio por link mágico ou OTP
   e sessões isoladas do painel empresarial.

Um papel global nunca substitui uma membership empresarial. O acesso de suporte
deve ser registrado em `support_sessions`, com empresa, motivo, nível e expiração.

## Papéis globais

- `super_admin`: administração integral da plataforma.
- `support`: diagnóstico e suporte com dados mascarados.
- `billing`: empresas, planos e cobrança.
- `operations`: integrações, mensagens e operação técnica.
- `auditor`: leitura para conformidade.

O painel fica em `/admin`. A existência da sessão é verificada no layout do
servidor; o cookie do proxy serve apenas como redirecionamento antecipado.

## Papéis empresariais

- `owner`: todas as permissões, inclusive cobrança.
- `admin`: administração da empresa, exceto cobrança.
- `manager`: operação, cadastros, agenda, equipe em leitura e auditoria.
- `receptionist`: clientes, agenda e inbox.
- `professional`: agenda própria e acesso clínico a pacientes vinculados à sua agenda;
  o vínculo com `professionals.user_id` é resolvido no servidor.
- `staff`: leitura operacional e inbox.
- `viewer`: somente leitura.
- `member`: legado tratado conservadoramente como somente leitura.

As permissões estão centralizadas em `src/lib/permissions.ts`. A interface filtra
a navegação, mas a proteção obrigatória ocorre nas Server Actions.

Desde 15/10/2026, `clinical.read`, `clinical.manage` e `clinical.issue` separam
prontuário de cadastro/agenda. Proprietário e administrador mantêm acesso clínico
global; profissional recebe acesso com escopo. Gerente, recepção, financeiro,
staff, viewer e member não recebem acesso clínico nem leitura global de documentos.
A emissão e finalização de consulta exigem o usuário do profissional responsável.
Formulários médicos exigem CRM/UF cadastrados, sem consulta automática ao conselho.
Consultar [guia do piloto clínico](clinicas-piloto.md) para implantação e limites.

## Organização ativa

Um usuário pode participar de mais de uma empresa. A empresa selecionada é salva
em cookie HTTP-only e sempre validada contra `organization_members`. Um ID enviado
pelo navegador nunca é aceito sem conferir a membership.

## Consumidor final

O portal `/cliente/[slug]` usa e-mail ou celular como identificador, link mágico
ou OTP como comprovação e uma sessão própria. O primeiro acesso só cria o cliente
depois da verificação. O portal expõe agenda e histórico de compromissos, nunca
observações internas.

## Escopo profissional

O papel `professional` depende do vínculo `professionals.user_id`. Consultas e
ações de agenda, clientes e disponibilidade recebem o `professionalId` resolvido
no servidor. IDs enviados pelo navegador não ampliam esse escopo.

## Ativação

1. Revisar e aplicar `drizzle/0007_smiling_king_cobra.sql` no ambiente desejado.
2. Garantir que a conta do administrador global já exista.
3. Executar:

```powershell
$env:PLATFORM_ADMIN_EMAIL='administrador@exemplo.com'
$env:PLATFORM_ADMIN_ROLE='super_admin'
npm run platform:grant
```

4. Entrar novamente e acessar `/admin`.

Papéis válidos para `PLATFORM_ADMIN_ROLE`: `super_admin`, `support`, `billing`,
`operations` e `auditor`.

## Pendências deliberadas

- Fluxo de encerramento manual de sessão de suporte.
- Elevação operacional de suporte com reautenticação.
- Permissões customizadas por usuário além dos papéis predefinidos.
- Homologação dos controles com a equipe do primeiro cliente; testes locais de
  matriz, ações e isolamento já existem em `tests/permissions.test.ts` e
  `tests/clinical-workspace.test.ts`.
