# WhatsApp Embedded Signup

## Experiência da clínica

1. Contratar um plano que use a API oficial.
2. Abrir **WhatsApp e automações**.
3. Clicar em **Conectar com a Meta**.
4. Entrar com uma conta Facebook administradora do negócio.
5. Selecionar ou criar o portfólio empresarial e a WABA.
6. Informar ou escolher o número empresarial.
7. Confirmar o código solicitado pela Meta.
8. Retornar ao Aggenda com o canal ativo.

O Aggenda troca o código temporário por um token, valida o número, assina o
webhook do aplicativo e associa o canal à organização. O token é criptografado
com AES-256-GCM antes de ser armazenado.

## Configuração da plataforma

Antes do primeiro uso, a conta Meta da Aggenda precisa:

- empresa verificada;
- aplicativo do tipo Business;
- produto WhatsApp habilitado;
- configuração de Embedded Signup criada;
- domínio de produção e URLs legais cadastrados;
- permissões de gerenciamento e mensagens aprovadas pela Meta;
- webhook apontando para `/api/webhooks/whatsapp`;
- campo `messages` assinado no aplicativo.

Variáveis necessárias:

- `NEXT_PUBLIC_META_APP_ID`;
- `NEXT_PUBLIC_META_WHATSAPP_CONFIGURATION_ID`;
- `META_WHATSAPP_APP_SECRET`;
- `META_WHATSAPP_VERIFY_TOKEN`;
- `META_WHATSAPP_GRAPH_VERSION`;
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` com ao menos 32 caracteres.

## Limitações inevitáveis

- Login, consentimento e OTP são etapas controladas pela Meta e não podem ser
  eliminadas pelo Aggenda.
- Aprovação do nome, verificação empresarial, migração e elegibilidade para
  coexistência podem deixar o canal pendente.
- O fluxo precisa ser homologado com número de teste antes de ser liberado para
  clientes.
