# Retornos por procedimento

Em **Procedimentos**, configure o prazo em dias ou meses e a antecedência em dias. Prazo vazio desativa a sugestão automática; os prazos são definidos pela clínica, sem valores clínicos predefinidos.

Em **Atendimento → Situação do atendimento**, ao selecionar **Concluído**, cada procedimento realizado permite usar a data sugerida, definir outra data ou não lembrar aquele retorno. Os procedimentos principal, adicionais de pacotes e adquiridos no atendimento são considerados; itens removidos, faltas e cancelamentos não geram retornos. Os dados são gravados na mesma transação da conclusão e do estoque.

Cada conclusão registra um snapshot individual. O CRM usa somente a realização mais recente de cada procedimento para cada cliente. Nova realização inicia outro ciclo; um novo agendamento ativo do mesmo procedimento suspende o convite, e seu cancelamento libera a situação anterior. A alteração do prazo no catálogo não muda datas já registradas. Desfazer a conclusão invalida seus retornos.

Em **CRM → Crescimento e recorrência → Retornos por procedimento**, consulte próximos, vencidos, futuros, já agendados, contatos registrados e dispensados. Busque por cliente ou procedimento. Registrar contato apenas salva o acompanhamento; não envia mensagens. Contatos registrados e dispensados saem da fila padrão de próximos/vencidos, evitando convites repetidos. A equipe pode devolver o retorno à situação “A contatar”.

No portal identificado do cliente, retornos próximos ou vencidos aparecem como convites à avaliação, com acesso ao novo agendamento. Não são uma autorização clínica automática para repetir o procedimento.

Atendimentos históricos não são preenchidos automaticamente. Para incluir um histórico, abra o atendimento concluído, revise os retornos sugeridos e atualize sua situação. Uma gravação posterior com “Usar data sugerida” preserva o snapshot existente.

Migração: `0063_procedure_returns.sql`. O script `scripts/apply-procedure-return-migration.ts` aplica e verifica essa migração de forma transacional. `tests/procedure-returns.test.ts` cobre as regras; `scripts/verify-procedure-returns.ts` cobre a integração em transação com rollback, sem conservar dados de teste.
