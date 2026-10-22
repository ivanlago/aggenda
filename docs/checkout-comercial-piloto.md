# Checkout comercial e piloto anual

Implementação de 22/10/2026. O catálogo cobrado no servidor é `src/lib/commercial-catalog.ts`; valores enviados pelo navegador nunca determinam preço ou permissões.

## Contratação pública

- Página `/assinatura`: teste gratuito de 30 dias, três composições, equipe de 1/2/3/5/10 profissionais e ciclos mensal/semestral/anual. Preços mensais do app: 49,90 / 68,80 / 87,70 / 106,70 / 134,20 reais.
- Mensal por cartão recorrente; Pix e períodos maiores antecipados e sem renovação automática. Comprar durante o teste inicia o período pago, sem somar os dias restantes; isso é informado antes do pagamento.
- Assinatura eletrônica opcional: 19,90 reais no mensal, com 50 documentos concluídos. Documentos enviados reservam capacidade para que possam ser concluídos; cancelar documento pendente libera reserva somente no módulo comercial. Teste e piloto contam documentos enviados, sem estorno da unidade ao cancelar.
- NFS-e de produção permanece bloqueada por homologação. O checkout não vende módulo fiscal enquanto indisponível; a franquia de dez notas reais do teste/piloto está registrada, mas não é promessa de emissão já ativa. Notas de homologação não consomem essa franquia.
- Teste: 1.000 respostas e 30 documentos em todo o período, até três profissionais, sem cartão e sem conversão automática.
- Pacotes extras: 500 respostas por 49,90 ou 100 documentos por 19,90 reais. Só após pagamento confirmado; válidos até o fim da franquia vigente, sem renovação e sem acúmulo. Recurso precisa estar ativo. Excedentes fiscais não são vendidos enquanto produção estiver indisponível.

## Piloto por convite

- Administração: `/plataforma/convites-piloto`, acessível a super_admin e billing; atalho em `/admin` e `/assinatura`.
- Administrador informa o e-mail do proprietário. O sistema gera link `/piloto/{token}` válido por 14 dias, vinculado ao e-mail, com uma utilização por empresa; token aleatório de 256 bits, somente hash no banco. Nenhum convite é enviado automaticamente.
- R$ 5,00 no total por um ano de Completo, pagamento único em cartão ou Pix, sem recorrência. Até três profissionais, conforme capacidade do teste.
- Acesso começa após confirmação; cada ciclo mensal renova 1.000 respostas, 30 documentos enviados e dez notas nacionais autorizadas quando habilitadas. Franquias não acumulam.
- Novas ferramentas podem ser testadas durante o ano conforme disponibilização/homologação; não há promessa de consumo externo ilimitado.
- A assinatura pré-existente não é alterada por migração. Se houver recorrência vigente, o proprietário deve cancelá-la antes de iniciar uma nova contratação para evitar pagamentos paralelos.

## Controles

- Pedidos pendentes não substituem contratos ativos. Confirmação aplica o preço registrado e provisiona app/agente/limites em transação.
- CHECKOUT_PAID e PAYMENT_CONFIRMED/RECEIVED não duplicam o primeiro período. Pagamentos recorrentes posteriores possuem identificador próprio. Estornos de créditos não cancelam o contrato-base.
- Acesso não recorrente expira na data paga. Aniversários mensais respeitam meses curtos e ano bissexto.
- Reservas de franquia serializadas por contrato, com identificador idempotente por operação. Respostas que falham antes de serem enfileiradas liberam a unidade. Mensagens recebidas não consomem respostas.
- Avisos no app e na assinatura em 80%, 95% e 100%; ao esgotar, novas operações pausam, dados e assinaturas já enviadas permanecem acessíveis. Reenvio de documento limitado a três solicitações em 24 horas.
- Lembretes proativos e campanhas não usam a franquia do agente; notificações automáticas de agendamento ficam desabilitadas para contratos novos até existir saldo próprio. Organizações legadas preservam configuração anterior.
- IA tem contexto e saída limitados e reserva financeira antes de cada chamada. Teto interno inicial: US$ 2 por teste; US$ 5 por ciclo mensal pago/piloto, com aferição de tokens quando o fornecedor informa uso. Gemini 3.1 Flash-Lite usa os preços pesquisados de entrada/saída; outros modelos têm avaliação conservadora que exige revisão antes de mudar o provedor. Falhas sem informação de uso mantêm a reserva por segurança. Atingir o teto encaminha à equipe. O fornecedor/conta de IA ainda deve manter orçamento próprio para proteger também ferramentas externas ao agente. Tarifas Meta permanecem separadas na oferta.

## Validação e liberação

- Migration `0081_commercial_checkout.sql` adiciona somente tabelas novas e foi validada em PGlite e em branch Neon antes de aplicada à produção.
- Testes cobrem preços, calendário, primeiro pagamento em ordens diferentes, duplicidade de eventos, mensal recorrente, valor divergente, concorrência na última unidade, créditos pré-pagos, estorno e expiração.
- Não foi realizado pagamento real nem enviado convite a terceiros durante a implementação. Após a publicação, um participante deverá efetuar o pagamento para homologar a conexão real Asaas → webhook → acesso.
