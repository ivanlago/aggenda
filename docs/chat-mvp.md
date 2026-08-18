# Aggenda Chat — especificação do MVP

O Chat é uma capacidade versionada da camada própria do Aggenda. Dados da
empresa, mensagens, horários, prompts e credenciais são isolados por organização.
O n8n é usado somente por automações comerciais configuráveis e publicadas.

## Dez cenários obrigatórios

1. Saudação, identificação da empresa e apresentação das opções.
2. Listagem de serviços, duração e preço cadastrado.
3. Listagem de profissionais habilitados para agendamento.
4. Consulta de horários pela disponibilidade real do Core.
5. Identificação ou criação do cliente pelo telefone.
6. Criação do agendamento e confirmação dos dados.
7. Consulta dos próximos agendamentos do cliente.
8. Reagendamento com nova validação de disponibilidade.
9. Cancelamento com coleta do motivo.
10. Transferência para humano em pedido explícito, falha ou baixa confiança.

## Regras do template

- exigir confirmação antes de criar, reagendar ou cancelar;
- nunca inventar serviço, preço, profissional ou horário;
- executar regras e respostas pela camada interna do Aggenda;
- guardar origem `whatsapp`, identificador da conversa e versão do workflow;
- aplicar timeout, três tentativas com espera progressiva e alerta após falha;
- remover credenciais e dados sensíveis dos logs;
- encerrar com fallback humano quando a intenção não for reconhecida;
- registrar resultado: resolvido, transferido, abandonado ou erro.

## Critério de homologação

Cada cenário deve possuir caso feliz, entrada inválida, indisponibilidade,
duplicidade e falha da API. A publicação exige execução completa em um número
de teste e evidência dos resultados.
