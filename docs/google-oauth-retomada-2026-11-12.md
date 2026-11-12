# Retomada da verificação OAuth do Aggenda

## Situação conferida em 12/11/2026

- Projeto: `aggenda-503803` (número `227743534388`).
- Marca verificada; acesso ao Google Agenda ainda não verificado.
- Política pública ainda exibia versão de 01/09/2026 na consulta desta data. A revisão de 12/11/2026 está em `src/app/privacidade/page.tsx` e precisa ser publicada.
- Escopos cadastrados: `userinfo.email`, `userinfo.profile`, `openid` e `calendar.events.owned`. O fluxo específico de calendário no código solicita `userinfo.email` e `calendar.events.owned`. Os demais são escopos de identidade; não ampliar o acesso do calendário para fazer a lista coincidir.
- Vídeo atualmente cadastrado: https://youtu.be/4hf_8WZQrmo . Não foi avaliado nesta revisão e não foi substituído.
- A conversa do Google aberta no Gmail contém uma mensagem de 02/09/2026 solicitando política revisada, demonstração com permissões expandidas e resposta na própria conversa.

## Roteiro para gravação (aproximadamente 4–6 minutos)

Use conta Google de teste, profissional e cliente fictícios. Não mostre senhas, códigos de autenticação, tokens ou dados de clientes reais. A autorização da conta deve ser feita pelo titular.

1. Abra a página inicial do Aggenda, mostre o nome do aplicativo e o link da Política de Privacidade. Abra a política e mostre a data de 12/11/2026 e a seção Google Agenda, incluindo dados, uso, compartilhamento, proteção e exclusão. Faça isso somente depois de publicar a revisão.
2. Mostre Equipe e acesso → Editar membro → Google Agenda. Explique que a conexão é opcional e vinculada ao profissional.
3. Clique em Conectar Google Agenda. Grave a seleção da conta de teste e o fluxo de consentimento. Se houver aviso de app não verificado, ele faz parte do estado atual da análise. O titular deve conduzir essa autorização.
4. Expanda “Mostrar todos os serviços”, “Ver detalhes” ou equivalente na tela de permissões. Deixe todas as permissões solicitadas legíveis durante alguns segundos. Mostre o nome Aggenda e o domínio. Não corte essa parte do vídeo.
5. De volta ao Aggenda, mostre o indicador conectado e o e-mail de teste.
6. Crie um agendamento fictício para esse profissional. Abra o calendário principal da mesma conta e mostre o evento criado, com horário, serviço e dados fictícios.
7. Reagende esse mesmo atendimento no Aggenda. Mostre a alteração do mesmo evento no Google Agenda, sem duplicação.
8. Cancele o atendimento fictício no Aggenda. Mostre a remoção do evento correspondente no Google Agenda.
9. Explique a necessidade de `calendar.events.owned`: criar, atualizar e excluir eventos dos agendamentos no calendário pertencente ao profissional. O escopo de e-mail identifica a conta conectada. Não afirme sincronização bidirecional, importação de toda a agenda ou recursos não demonstrados.

Envie o vídeo ao YouTube como não listado, confirme que abre sem autorização adicional e substitua o link em Google Auth Platform → Acesso a dados → Vídeo de demonstração. Não adicione escopos para a demonstração. Se o projeto também tiver clientes OAuth para outros fluxos, confira quais deles precisam aparecer no vídeo solicitado pelo Google.

## Resposta para a conversa existente — revisar antes de enviar

Não enviar este texto antes de confirmar a política pública e preencher o link do vídeo.

Hello Google OAuth Verification Team,

We are following up on the verification request for Aggenda, project ID aggenda-503803 (project number 227743534388).

We have updated our privacy policy to explicitly describe the Google user data accessed, its purpose and use, sharing and disclosure, protection mechanisms, retention, and deletion:
https://www.aggenda.app.br/privacidade#google-agenda

Updated demonstration video: [INSERT NEW UNLISTED YOUTUBE VIDEO URL]

The video shows the OAuth consent flow with the requested permissions fully expanded and readable, followed by appointment creation, rescheduling, and cancellation and their corresponding effects in the connected professional's Google Calendar.

The calendar integration requests userinfo.email to identify the connected account and calendar.events.owned to create, update, and delete appointment events in the professional's own calendar. We do not import the user's entire personal calendar. The video and the current scope configuration are available for your review.

Please resume the review of our application. If this conversation or request is no longer active, please advise how to reopen or resubmit it.

Thank you,
Ivan Lago
Aggenda

## Ordem de conclusão

1. Publicar e confirmar a política atualizada na URL pública.
2. Gravar e revisar o vídeo, verificando especialmente as permissões expandidas.
3. Atualizar o link do vídeo na solicitação do Google Cloud e seguir eventual opção de submissão exibida no console.
4. Responder à conversa existente com o texto revisado e os links reais.
5. Acompanhar a Central de verificação e novas mensagens. A publicação da política ou a resposta ao e-mail não constitui aprovação automática.
