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

### Assinatura eletrônica e documentos clínicos

- O módulo próprio do Aggenda para assinatura eletrônica, receitas e atestados está implementado localmente, incluindo banco de dados, trilha de auditoria, verificação pública e envio por e-mail via Resend.
- Pendência: publicar a versão atual da aplicação e executar a primeira validação real de emissão, assinatura, verificação e entrega do documento por e-mail.
- Integrações especializadas eventualmente exigidas por uma clínica ou profissional continuarão sendo contratadas e custeadas pelo próprio cliente.

## Item 7 — Agenda externa (Google Calendar)

- Projeto Google Cloud identificado: `Aggenda` (`aggenda-503803`).
- Cliente OAuth web `Aggenda` existente; `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` já estão configurados em Production e Preview na Vercel.
- O código já implementa login Google e sincronização com Google Calendar usando os escopos `userinfo.email` e `calendar.events`.
- Configuração operacional concluída no Google Cloud: Google Calendar API ativada e aplicativo OAuth publicado como `Em produção`.
- O cliente OAuth mantém somente a origem HTTPS `https://www.aggenda.app.br` e os callbacks de produção `/api/auth/callback/google` e `/api/google-calendar/callback`.
- Escopos declarados e salvos: `openid`, `userinfo.email`, `userinfo.profile` e `calendar.events`; a justificativa de uso do escopo de calendário também foi registrada.
- Pendência de homologação comercial: o escopo confidencial `calendar.events` ainda precisa da verificação do Google. Para solicitar a aprovação será necessário gravar e publicar um vídeo demonstrativo do fluxo em funcionamento; até a aprovação, o Google poderá exibir a tela de aplicativo não verificado e aplicar o limite de 100 usuários.
- Pendência recomendada e não bloqueante: criar `GOOGLE_TOKEN_ENCRYPTION_KEY` dedicada na Vercel. Atualmente a aplicação usa com segurança o fallback `BETTER_AUTH_SECRET`, desde que tenha pelo menos 32 caracteres.

## Item 8 — Pagamentos das clínicas

- Manter como pendência, conforme decisão atual.
- O Item 8 trata das contas financeiras pertencentes a cada clínica: Asaas, Mercado Pago, PagBank, Efí e conciliação dos demais provedores.
- Antes da liberação comercial definitiva, ainda será necessário concluir as homologações reais que dependem das contas de cada provedor e registrar as respectivas evidências de produção.

## Item 9 — Cobrança da assinatura do Aggenda

- A conta de produção do Asaas está aprovada e a chave de API `Aggenda` está habilitada.
- `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e `ASAAS_ENVIRONMENT` estão cadastradas na Vercel para Production e Preview.
- O webhook `Aggenda assinaturas` está ativo, usa API v3, envio sequencial e token de autenticação.
- A URL do webhook foi corrigida do domínio antigo para `https://www.aggenda.app.br/api/webhooks/asaas`.
- Os eventos tratados pelo Aggenda estão selecionados, incluindo criação, atualização, confirmação, recebimento, atraso, exclusão, estorno, checkout, assinatura e chargeback.
- O endpoint público foi validado e responde `401` sem o token, confirmando que está acessível e protegido.
- O código já cobre contratação mensal, trimestral, semestral e anual, recorrência mensal por cartão, pagamento antecipado por Pix, inadimplência, cancelamento e nova contratação/reativação.
- Pendência comercial: definir os preços definitivos dos planos e atualizar `ASAAS_PLAN_MONTHLY_VALUE`, `ASAAS_PLAN_QUARTERLY_VALUE`, `ASAAS_PLAN_SEMIANNUAL_VALUE` e `ASAAS_PLAN_ANNUAL_VALUE`.
