# Piloto: Secretária com menu e conversa natural

O produto comercial permanece no fluxo aprovado. O piloto usa o mesmo catálogo, validações, permissões, franquias, filas e confirmação de operações. Nenhum novo produto foi criado.

## Ativação restrita

Variável exclusiva do servidor `AGGENDA_SECRETARY_HYBRID_CONTACTS`, no formato `uuid-da-organizacao:telefone-com-DDI`. Vários pares são separados por vírgula. Não aceita curingas. Organização e contato devem coincidir e a modalidade deve ser `core_ai`. Vazio/desconfigurado mantém o fluxo comercial para todos.

A configuração foi preparada para o contato informado pelo responsável tanto localmente quanto no projeto Vercel (`production` e `preview`). A variável Vercel foi criada em 11/11/2026 e só será utilizada pelas próximas publicações. Falta publicar o código para testar no WhatsApp conectado à produção. A variável local não deve ser versionada. Caso o atendimento esteja assumido ou encerrado, devolver à IA/reabrir primeiro.

## Comportamento

- Menu, números, botões e confirmação explícita preservam o caminho existente.
- Mensagens livres do contato piloto são interpretadas antes das heurísticas que perguntavam novamente o profissional/data. O contexto inclui as últimas 12 mensagens, catálogo público, profissionais e agendamentos do cliente identificado.
- Preferências de manhã, tarde e noite filtram os horários reais retornados pelo sistema.
- Pedidos comuns para falar com uma pessoa encaminham diretamente à equipe, sem consulta ao modelo.
- Reservar, reagendar e cancelar continuam exigindo confirmação, validade da proposta e revalidação; a IA não grava uma reserva por conta própria.
- Não há garantia de linguagem natural apenas por testes com respostas simuladas. A avaliação real deve conferir entendimento, preços, continuidade, latência e consumo do provedor configurado.
- O piloto envia o contrato de resposta também em `response_format.json_schema`, com campos obrigatórios, além da validação local e de uma tentativa de reparo. O fluxo comercial mantém `json_object`. A mudança corrige respostas em JSON que omitiam campos necessários, identificadas nos logs em 11/11/2026.
- A intenção `goal=book` solicita a consulta real na primeira resposta quando serviço, profissional e data estiverem identificados, mesmo que o modelo proponha somente responder o preço. Afirmações de disponibilidade no texto do modelo também são substituídas pela consulta validada; dados faltantes geram uma pergunta.
- Pedidos explícitos de cancelamento apresentam imediatamente os agendamentos futuros do cliente. Número, nome do serviço ou data/horário permitem selecionar a reserva, sempre com confirmação antes de cancelar. Perguntas de preço ou mudanças de intenção não são tratadas como seleção de cancelamento.

## Roteiro de avaliação no contato piloto

1. `Bom dia` → menu habitual; escolher uma opção por número.
2. `Quero uma avaliação com Camila na segunda de manhã. Quanto custa?` → não repetir serviço/profissional; perguntar somente o que faltar ou consultar horários.
3. `Pode ser na terça, depois das 14h` → continuar a mesma intenção, aproveitando o contexto.
4. Escolher horário → conferir proposta; antes de `CONFIRMAR`, verificar que nenhuma reserva foi criada.
5. Reagendar e cancelar → conferir proposta e preservação da reserva antes de confirmar.
6. `Quero falar com uma pessoa` → fila humana e IA pausada.
7. Usar outro número → fluxo comercial sem piloto.

Testes automatizados usam banco isolado e respostas do modelo simuladas: não enviam WhatsApp nem alteram a agenda real. Referência comercial preservada em `docs/baselines/secretaria-comercial-2026-11-11`.
