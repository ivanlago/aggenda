# Duas modalidades de atendimento no WhatsApp

`chat_ai` (Chat + AI) e `core_ai` (Core + AI) compartilham o catálogo e a navegação.
Não são dois bancos de dados nem duas cópias de workflow por cliente.

## Comportamento

- Saudação: “Olá! Você está falando com [empresa]. Como podemos ajudar?”.
- Menu: procedimentos/agendar, meus agendamentos, produtos (se houver estoque
  vendável), unidade e informações, falar com a equipe.
- Menus em listas interativas da Meta; números e texto livre continuam aceitos.
  As escolhas interativas precisam ter sido oferecidas na última resposta.
- Catálogos maiores usam categorias e paginação de até sete itens, mais
  navegação, respeitando dez opções por lista. Categorias vazias são omitidas.
- Catálogos pequenos mostram os procedimentos diretamente. Há “Não sei qual
  escolher”, que registra um repasse humano. MENU volta ao início.
- Procedimentos exibem descrição, duração, preço e preparação cadastrados.
- Chat + AI envia link da área do cliente, com `novo=1&servico=<id>`. A seleção
  continua após código ou link de acesso por e-mail. O formulário só pré-seleciona
  serviços ativos da própria empresa; o link não autentica nem cria uma reserva.
- Core + AI continua o fluxo interno existente, revalida disponibilidade e
  aguarda confirmação antes de reservar, reagendar ou cancelar. O resumo da nova
  reserva inclui endereço público e preço. Presença tem confirmação separada.
  Solicitações de alteração expiram em 15 minutos, usando prazo UTC explícito.
- Procedimentos com sinal/pagamento seguem para o portal, que já implementa
  reserva e cobrança; o agente não deve contornar essa exigência.
- Meus agendamentos oferece consulta, reagendamento, cancelamento e presença.
  No reagendamento, informar somente a data já consulta horários do mesmo serviço
  e profissional, excluindo o próprio agendamento do conflito. A resposta oferece
  até dez opções numeradas, aceita número ou horário e mantém a data no contexto.
  A disponibilidade é consultada novamente na escolha e revalidada na confirmação;
  sem vagas, solicita outra data e preserva a reserva original. Nenhuma alteração
  ocorre apenas ao consultar ou escolher uma opção.
  Escolhas de agendamento aceitam número, nome, data e horário. A modalidade Chat
  encaminha todas essas operações ao portal autenticado.
- Identificação ambígua por telefone é encaminhada à equipe, sem selecionar um
  cadastro arbitrário. Menus e consultas informativas não criam clientes.
- Repasse humano registra a pendência e pausa a automação. A mensagem informa
  retorno no horário de atendimento, sem prometer disponibilidade imediata.

## Produtos e PDF

Somente produtos/variações ativos, destinados à venda, com estoque vendável
aparecem no catálogo. Estoque por lote segue a regra existente de validade e
quarentena. Quantidades, códigos internos, custos e comissões não são expostos.
O PDF e a identificação textual incluem produto, apresentação e marca cadastrados.
Apresentação genérica "Padrão" e marca vazia são indicadas como não informadas no
PDF; unidades e marcas não são inferidas. No estoque misto, lotes regulares e
saldo sem lote permanecem disponíveis. Apenas a quantidade dos lotes restritos
fica bloqueada, seguindo a mesma regra do PDV.

PRODUTOS envia um documento pelo WhatsApp. O PDF é gerado com os dados atuais,
data de atualização, apresentação, preço, descrição e fotos cadastradas no
Cloudinary quando disponíveis. Para manter o download responsivo, miniaturas são
limitadas aos primeiros 32 itens e têm timeout; falhas de foto não bloqueiam o
documento. Todos os itens continuam listados mesmo sem foto.

O aviso orienta confirmar disponibilidade e valor antes da compra e informa que
preços podem mudar. A conclusão da compra é feita com a equipe. A busca textual
por nome do produto também informa preço e oferece catálogo/repasse.

O endereço do PDF tem assinatura HMAC por organização e validade de 24 horas,
usando a chave interna existente. A resposta é `private, no-store`. Um link
válido pode ser compartilhado durante sua validade; não contém dados pessoais.

## Implantação

Não há nova migração de banco nesta entrega. A migração anterior de categorias
(`0080`) precisa já estar aplicada. Use os planos existentes `chat_ai` e
`core_ai`, um canal ativo e os cadastros da empresa.

Atualize **a aplicação e o worker de outbox** juntos: ambos os produtos de IA
passam pelo agente interno, mesmo se houver um webhook n8n antigo configurado.
As demais modalidades mantêm o roteamento anterior. O worker passa a enviar
texto, lista interativa e documento, e o webhook reconhece respostas de lista.

`NEXT_PUBLIC_APP_URL` deve apontar para a aplicação pública HTTPS acessível à
Meta para baixar o PDF. `AGGENDA_INTERNAL_API_URL` e `AGGENDA_INTERNAL_API_KEY`
continuam necessários ao worker. A IA usa a configuração já existente
`AI_API_URL`, `AI_API_KEY`, `AI_MODEL` (ou aliases CRM). Menus, catálogos e fluxos
determinísticos não dependem de chamada ao modelo.

O cadastro atual fornece **um endereço público por empresa**. Não há entidade de
múltiplas unidades nem configuração de expediente da equipe nesta entrega. O
agente usa os dados públicos disponíveis e registra retorno humano sem inventar
endereços, horários ou disponibilidade da equipe.

## Validação

Testes: `tests/whatsapp-navigation.test.ts`, `tests/whatsapp-agents.test.ts`,
`tests/conversation-lifecycle.test.ts`, `tests/public-booking.test.ts` e
`tests/whatsapp-command.test.ts`.

As rotas reais são executadas com PostgreSQL isolado (PGlite), ferramentas
externas substituídas e nenhuma mensagem enviada a clientes. A homologação de
envio real de listas/PDF exige canal Meta e URL pública configurados.
