# Equipamentos e disponibilidade

Cadastro em **Cadastros → Equipamentos**. Nome, ordem de exibição, status, uso exclusivo/compartilhado e serviços vinculados. O formulário segue o padrão compacto do Aggenda, com edição em modal e lista paginada.

- Cada registro representa um equipamento. Cadastre aparelhos distintos separadamente.
- **Não permite atendimentos simultâneos**: todos os serviços vinculados disputam esse equipamento durante todo o intervalo do atendimento, independentemente de profissional ou sala.
- **Permite atendimentos simultâneos**: não adiciona bloqueio de capacidade à agenda. Regras de profissional e sala continuam valendo.
- Todos os equipamentos vinculados a um serviço são necessários. Não há seleção automática entre aparelhos equivalentes nem limite de capacidade maior que um nesta versão.
- Equipamento inativo ainda vinculado a um serviço impede novas reservas desse serviço. Para deixar de exigir o equipamento, remova o vínculo.
- Cancelamento e falta liberam o recurso. Os intervalos são semiabertos: um atendimento pode começar exatamente quando outro termina.
- Alterar vínculos afeta também agendamentos futuros. A configuração recusa uso exclusivo com sobreposições existentes e desativação de equipamento necessário em agendamentos futuros.

## Implementação e validação

Migração Drizzle `0101_service_equipment`: duas tabelas, validação de empresa nos vínculos e trigger de reserva de equipamento. Lock transacional por empresa, compartilhado com a ação de configuração, cobre Agenda, portal, WhatsApp/IA e integrações que gravam agendamentos.

Consulta de disponibilidade filtra os horários pelo equipamento; o trigger faz a conferência final para impedir corridas de reservas simultâneas. Serviços sem equipamentos vinculados mantêm o comportamento anterior.

Testes: `node node_modules/tsx/dist/cli.mjs --test tests/equipment.test.ts tests/service-professionals.test.ts`.

A migração foi testada em cópia do banco (`br-frosty-brook-auda7beo`) e aplicada ao banco configurado em 12/11/2026, preservando os 49 agendamentos e deixando o cadastro vazio. Concorrência real com duas conexões PostgreSQL foi validada com dados fictícios nessa cópia. Script de reprodução restrito à cópia: `scripts/validate-equipment-concurrency.mjs`. O compute de validação foi limitado a 0,25 CU com suspensão automática após 300 segundos.

A publicação da aplicação é necessária para exibir o novo cadastro.
