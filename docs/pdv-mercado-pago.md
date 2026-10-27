# Mercado Pago no PDV

## Configuração

Em Financeiro → Pagamentos → Mercado Pago, conecte e valide a conta da própria empresa e configure o webhook. Marque **Usar como provedor padrão no PDV** e salve. A preferência é exclusiva de cada empresa. Somente conexões ativas com webhook configurado aparecem como opção.

Em Venda e orçamento, escolha o recebimento pelo Mercado Pago ou manual. O padrão apenas preenche a seleção inicial; recebimentos manuais e divididos continuam disponíveis. Nesta etapa, a integração atende o PDV independente; o recebimento dentro do atendimento permanece manual.

## Venda integrada

1. O servidor calcula os preços e verifica permissões, descontos e estoque.
2. A venda e o financeiro ficam pendentes; produtos ficam reservados e pacotes ainda não podem ser utilizados.
3. O operador abre ou copia o link de pagamento. O Checkout Pro oferece os meios habilitados na conta recebedora. Não há integração com maquininha Point nesta etapa.
4. O Aggenda confirma o pagamento consultando a API do Mercado Pago, por webhook autenticado ou pelo botão de consulta. Retornar do checkout não comprova pagamento.
5. Após aprovação, a venda é concluída, o financeiro é recebido e os pacotes são liberados. O estoque reservado não é descontado novamente. Taxas e líquido são exibidos quando informados pelo provedor.

O link público contém somente identificação da empresa, valor e situação até o pagamento. O recibo da venda só é liberado após confirmação.

## Pendências e cancelamentos

O checkout tem vigência de 24 horas. Sua expiração não devolve estoque automaticamente: use o cancelamento na página da venda. O Aggenda desativa o checkout, consulta tentativas existentes e cancela pagamentos pendentes antes de devolver a reserva. Uma falha de comunicação mantém a reserva para evitar vender o mesmo saldo duas vezes.

Se a criação do checkout ficar inconclusiva, o Aggenda não tenta criar outro automaticamente. Consulte a situação e procure suporte; sem identificador recuperável, o cancelamento aguarda o término da vigência e uma margem de segurança, consultando o provedor antes de liberar estoque.

Estornos devem ser solicitados no Mercado Pago. O webhook atualiza a venda; estorno parcial, contestação, pagamento adicional ou aprovação tardia exigem conferência. Esses casos não liberam itens automaticamente. Um estorno financeiro não significa devolução física: registre a entrada do produto somente quando a devolução realmente ocorrer. Pacotes vinculados ficam suspensos.

Não troque a conta ou ambiente de uma conexão com vendas integradas ainda sujeitas a acompanhamento. O Aggenda impede essa troca para preservar a conciliação. Desconectar não remove as credenciais necessárias para validar notificações posteriores.

## Validação

Testes automatizados usam PostgreSQL isolado, dados sintéticos e transporte simulado, sem cobranças reais. Cobrem reserva, aprovação, notificações repetidas, autorização, separação entre empresas, cancelamento, estorno, checkout concorrente, timeout e recebimento manual. O teste real de ponta a ponta com uma nova venda no PDV deve ser realizado pela empresa, incluindo conferência da baixa pelo webhook. O ambiente de testes utiliza exclusivamente o link sandbox.
