# Conversas comerciais e repasses da IA

O sino do cabeçalho conta somente conversas que a IA repassou à equipe e que ainda aguardam resolução. O clique abre o filtro **Repasses da IA pendentes**.

| Ação | Resultado no alerta |
| --- | --- |
| IA solicita atendimento humano | Inclui a conversa no contador |
| Equipe assume esse repasse | Mantém o alerta até a resolução |
| Equipe assume uma conversa comum | Não cria alerta de repasse da IA |
| Encerrar conversa | Remove o alerta e preserva mensagens e auditoria |
| Devolver à IA | Remove o alerta e retoma a automação |
| Nova mensagem após encerramento | Reabre com a IA, sem alerta humano automático |
| Novo repasse da IA | Cria uma nova pendência |

A lista começa com **Em aberto**, incluindo dias anteriores. Para consultar o histórico, selecionar **Resolvida** ou **Todas as situações**. O encerramento aceita motivo opcional; o histórico oferece **Reabrir conversa**. Não há encerramento automático por inatividade nem envio de mensagem ao cliente ao encerrar.

O contador atualiza após ações do formulário, ao retornar à aba e a cada 45 segundos enquanto a página está visível. Conversas encerradas não retomam operações pendentes da questão anterior. Reentregas do webhook não reabrem conversas; mensagens antigas e trabalhos atrasados da IA têm proteções contra reativação da questão encerrada.

## Banco e validação

- Migração `0077_conversation_attention`: adiciona `needs_human_attention`; reconhece repasses existentes ainda pendentes cujo motivo começa com `IA:`. Transferências manuais antigas não são presumidas como repasses da IA.
- Teste `tests/conversation-lifecycle.test.ts`: executa a migração e as ações reais, o contador, o webhook assinado e a rota da IA em PostgreSQL isolado (PGlite), com envios externos substituídos. Verifica isolamento por clínica, autorização, histórico, encerramento, reabertura, mensagem atrasada, repetição e trabalho antigo da IA.
- Conferência no navegador: filtros, botões de encerramento e sino com zero pendências mesmo existindo conversas comuns abertas. Nenhuma conversa real foi encerrada ou mensagem enviada durante a conferência.

Execução: `npx --no-install tsx --test tests/conversation-lifecycle.test.ts`.
