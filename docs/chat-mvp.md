# Aggenda Chat — especificação do MVP

O Chat deve ser um template único e versionado no n8n. Dados da empresa,
mensagens, horários e credenciais são parâmetros por organização, nunca cópias
independentes do workflow.

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
- usar as APIs genéricas `/api/n8n`, evitando os aliases legados de clínica;
- guardar origem `whatsapp`, identificador da conversa e versão do workflow;
- aplicar timeout, três tentativas com espera progressiva e alerta após falha;
- remover credenciais e dados sensíveis dos logs;
- encerrar com fallback humano quando a intenção não for reconhecida;
- registrar resultado: resolvido, transferido, abandonado ou erro.

## Critério de homologação

Cada cenário deve possuir caso feliz, entrada inválida, indisponibilidade,
duplicidade e falha da API. A publicação exige execução completa em um número
de teste e evidência dos resultados.
