# Serviços complementares em Assinaturas

## Oferta e elegibilidade

Administração → Assinaturas reúne planos e complementares. Assinatura eletrônica é adicional para um contrato comercial ativo que ainda não a inclua. Testes/pilotos com franquia e contratações legadas não recebem uma cobrança adicional automática; alterações legadas continuam dependendo de atendimento. NFS-e permanece bloqueada no servidor para contratação até homologação.

## Cálculo e franquia

O servidor calcula o preço, sem aceitar valores livres do navegador. Calcula cada intervalo mensal a partir do aniversário original do contrato com `addCalendarMonths`, incluindo fevereiro, meses curtos e horas, e cobra a fração restante de cada intervalo até o fim do período pago. O arredondamento para centavos ocorre no total. Mantém os descontos de ciclo já usados na contratação normal: 10% no semestral e 20% no anual. O resumo mostra preço, vencimento, franquia inicial e valor da próxima renovação.

A franquia do primeiro intervalo mensal também é proporcional, arredondada para cima; os seguintes têm 50 documentos/mês. Reinicia na data mensal do contrato, sem acumular. A franquia ativa é considerada tanto na reserva de documentos quanto no resumo da assinatura. Créditos avulsos continuam sendo somados separadamente.

## Confirmação e renovação

O checkout do adicional é um pagamento único. A ativação exige confirmação autenticada, valor correto e o mesmo contrato/período de origem. Preserva plano, profissionais, acesso já pago e data de renovação. Pagamento confirmado após troca/expiração do contrato exige conciliação.

Para cartão mensal com renovação ativa, atualiza o valor das próximas cobranças da assinatura Asaas, preservando o vencimento e as cobranças já geradas (`updatePendingPayments: false`). A atualização requer tokenização habilitada no Asaas. Falha nessa atualização mantém o processamento inconclusivo para nova tentativa/conciliação, sem presumir sucesso. Depois da confirmação, a próxima mensalidade e a renovação da franquia incluem o serviço.

Planos pré-pagos sem renovação automática exigem nova escolha dos serviços na próxima contratação; o complemento atual termina junto do período já pago.

O retorno do checkout consulta o pedido específico: possuir um plano ativo não basta para exibir confirmação do pagamento do adicional.

## Estornos e idempotência

Eventos repetidos não duplicam acesso, franquia ou ajuste recorrente. Estorno revoga o complemento e restaura o valor futuro do plano recorrente. Não cancela o plano-base. Se um novo ciclo com o serviço já foi pago, a franquia daquele contrato permanece até seu vencimento; a retirada afeta a próxima renovação. Repetir um estorno antigo não altera uma contratação posterior.

## Verificação

`npm run test:commercial`: preços proporcionais e anuais, limites de calendário, ativação em PostgreSQL isolado, falha simulada do Asaas, eventos duplicados, estorno, recontratação e renovação com o novo valor. APIs externas são simuladas nos testes; não houve cobrança real nem alteração de assinaturas de produção nesta implementação.
