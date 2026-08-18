# Pendências dos serviços externos

Atualizado em 18/08/2026.

## Item 1 — Coolify, n8n e atendimento pelo WhatsApp

- Aguardar o novo número comercial do WhatsApp.
- Depois do cadastro do número na Meta, registrar o canal na organização e repetir o teste completo: mensagem recebida, processamento no n8n e resposta no WhatsApp.

## Item 2 — Notificações por e-mail e SMS

- E-mail transacional concluído com Resend e remetente `Aggenda <contato@aggenda.app.br>`.
- SMS permanecerá desativado no lançamento, pois não foi identificado um provedor com franquia gratuita permanente para produção.
- Pendência futura e não bloqueante: escolher um provedor pago somente se houver decisão de oferecer notificações por SMS.

## Item 3 — Meta e WhatsApp Business

- Webhook de produção configurado e evento `messages` assinado.
- Aplicativo publicado e dados públicos atualizados para a marca Aggenda.
- Aguardar o novo número para cadastrá-lo e validá-lo na Meta.
- Cadastrar a forma de pagamento da conta do WhatsApp Business após a inclusão do número.
- Realizar o teste real de envio e recebimento depois da ativação.
- Opcional e recomendado: concluir a verificação da empresa, que exige documentos empresariais e análise da Meta.

## Item 4 — Inteligência artificial e orquestrações comerciais

- A camada de IA foi centralizada no Aggenda e mantém o Google Gemini `gemini-3.1-flash-lite`, o mesmo modelo já adotado nos workflows existentes.
- Mensagens do WhatsApp passam pelo gateway interno do Aggenda; regras, contexto, segurança, handoff, histórico e medição não ficam no n8n.
- O n8n fica reservado ao evento `commercial.automation.requested`, para templates comerciais publicados e configuráveis.
- `AI_API_URL`, `AI_MODEL` e `AGGENDA_INTERNAL_API_KEY` foram configurados na Vercel; `AGGENDA_INTERNAL_API_URL` e o mesmo segredo interno foram configurados no worker do Coolify.
- Pendência operacional: cadastrar apenas `AI_API_KEY` na Vercel. A credencial existente foi validada no n8n, mas o valor secreto salvo não é exibido para reutilização automática.
- Pendência de homologação: repetir o teste ponta a ponta depois do cadastro do novo número do WhatsApp.
