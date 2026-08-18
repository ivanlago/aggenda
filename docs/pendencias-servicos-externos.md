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
- `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` e `AGGENDA_INTERNAL_API_KEY` estão configurados na Vercel; `AGGENDA_INTERNAL_API_URL` e o mesmo segredo interno estão configurados no worker do Coolify.
- A aplicação foi reimplantada em produção com a configuração completa da IA.
- Pendência de homologação: repetir o teste ponta a ponta depois do cadastro do novo número do WhatsApp.

## Item 5 — Demais serviços externos

- Concluído sem contratação ou configuração adicional.
- Os serviços obrigatórios já estão cobertos por Vercel, Neon, Coolify, Meta, Resend, Google Calendar, Google Gemini e Cloudinary, além dos provedores financeiros já configurados.
- Google Sheets, CRM externo, SMS pago, verificação empresarial da Meta e serviços semelhantes permanecem opcionais e serão ativados somente quando houver demanda comercial.
- Não há pendência externa bloqueante neste item.

## Item 6 — Calendário, arquivos e serviços complementares

- Concluído com os serviços já adotados no projeto.
- Google Calendar possui integração OAuth própria do Aggenda e credenciais configuradas em Production e Preview.
- Cloudinary já atende ao armazenamento e à entrega autenticada de imagens, também com credenciais nos três ambientes da Vercel.
- Não é necessário contratar outro serviço de calendário, arquivos, analytics ou monitoramento para a operação inicial.
- Google Sheets, PostHog, Sentry e conectores adicionais permanecem evoluções opcionais, sem pendência bloqueante.
