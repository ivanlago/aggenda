# Identificação e reservas no portal

O portal exige sessão validada por código de e-mail antes de criar reservas. O usuário pode informar e-mail ou celular cadastrado, mas o código é entregue ao e-mail; não foi contratado envio por WhatsApp/SMS.

## Paciente e dependentes

O acesso pertence a um cadastro. Em **Clientes → cadastro do responsável → Dependentes no portal do cliente**, a equipe com permissão de gerenciar clientes pode autorizar ou remover vínculos com dependentes já cadastrados. Deve conferir a identidade e a autorização. Cada vínculo é auditado e limitado à mesma clínica.

No portal, **Para quem é o agendamento?** permite consultar e agendar para si ou para um dependente autorizado. O servidor verifica o vínculo em cada requisição de reserva, disponibilidade e voucher. Não basta enviar o identificador de outra pessoa. O vínculo não concede acesso a prontuários, laudos ou documentos clínicos. Um telefone ou e-mail compartilhado não cria vínculos automaticamente.

O responsável verá histórico e reservas do dependente no portal; considere essa abrangência ao obter autorização. Links individuais de gerenciamento já entregues continuam sendo credenciais próprias do agendamento e devem ser protegidos.

## Regras de reserva

- Sobreposição: o paciente não pode reservar horários sobrepostos, inclusive entre profissionais diferentes na mesma clínica. Limites contíguos são permitidos.
- Repetição exata: o mesmo paciente, procedimento, profissional e horário retorna a reserva ativa existente, sem outra reserva, consumo de voucher ou cobrança.
- Outra sessão do mesmo procedimento: o padrão é alertar e exigir confirmação das reservas existentes. Em **Procedimentos → editar → Reservas repetidas no portal**, a clínica pode bloquear uma segunda reserva futura.
- Concorrência: uma trava transacional por paciente serializa reservas e reagendamentos públicos. As validações são repetidas antes do insert/update.
- Reagendamento: a reserva sendo movida é excluída da comparação, mas as outras reservas do paciente continuam bloqueando sobreposição.
- Disponibilidade: horários que coincidem com reservas do paciente identificado são omitidos; o servidor continua validando ao confirmar.
- Sinal: se uma repetição chegar enquanto a geração do sinal ainda estiver em andamento, o portal informa que a reserva já existe. Não repete a cobrança. Falhas de geração do sinal continuam exigindo acompanhamento pela clínica.

As proteções são do fluxo público. O cadastro e a agenda internos mantêm suas regras operacionais existentes. A identificação não detecta a mesma pessoa cadastrada duas vezes com contatos diferentes, nem consultas em outras clínicas.

## Banco e verificação

Migration **0075_portal_booking_safety**: tabela de vínculos com chaves por clínica e campo de política de repetição nos procedimentos. Foi testada em PostgreSQL isolado (PGlite) e aplicada ao banco configurado após confirmar que era a única pendente. Nenhum vínculo ou agendamento foi criado no banco conectado durante a conferência.

Execute npm run test:public-booking. O teste percorre as rotas reais de solicitação/validação de código, criação e reagendamento, com banco isolado e envios/pagamentos externos substituídos por doubles. Inclui sessão ausente, cadastro não autorizado, vínculo de outra clínica, remoção de vínculo, clique repetido, conflito entre profissionais, confirmação de sessão repetida, política de bloqueio e requisições simultâneas.

Conferência no navegador: primeiro acesso, ausência de rolagem horizontal em 744 px úteis, opções de repetição no procedimento e formulário interno de autorização de dependentes. Nenhum formulário foi enviado. O envio real do e-mail e o percurso autenticado com uma conta de paciente precisam ser conferidos no piloto; o teste automatizado valida esse percurso com entrega simulada.

## Complemento de conferência autenticada — 17/10/2026

O usuário confirmou o recebimento real do código por e-mail e realizou o login. A sessão autenticada exibiu o cadastro correspondente, seletor de paciente, histórico e estado sem reservas futuras ativas. Não havia dependentes vinculados para testar a alternância entre pessoas.

Foi selecionado um procedimento, um profissional e uma data dentro da janela permitida. A consulta retornou horários e a escolha de um deles exibiu a revisão com procedimento, profissional, data e horário. A largura útil e a largura do documento permaneceram iguais (744 px). A consulta de erros de console não retornou erros. O botão Confirmar agendamento não foi acionado. As escolhas de teste foram limpas e a sessão permaneceu aberta.

Os avisos de repetição e sobreposição não puderam ser reproduzidos nesta conta sem criar reservas, pois não existiam reservas futuras. Esses cenários seguem cobertos pelo teste integrado isolado; não foram validados visualmente com dados ativos nesta sessão. Nenhum agendamento foi criado, reagendado ou cancelado.

Evidência: [revisão antes da confirmação, sem reserva criada](./qa-visual-2026-10-17/portal-revisao-autenticada.png). A captura não inclui nome ou contato do paciente.
