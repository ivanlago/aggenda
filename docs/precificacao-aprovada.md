# Precificação aprovada do Aggenda

Decisão aprovada pelo usuário em 21/10/2026. Referência para implementação futura; não altera preços, contratos, checkout ou produção automaticamente.

### Ajuste aprovado para a página comercial

Na criação da landing page, o usuário escolheu ajustar o anual do app para **R$ 39,90/mês equivalente**, total **R$ 478,80/ano**, em vez dos R$ 39,92/R$ 479,04 da fórmula original. Mensal permanece R$ 49,90. Este ajuste específico prevalece sobre a linha do app na tabela histórica abaixo. Os adicionais mantêm os preços/descontos aprovados. Composições anuais anunciadas: app + Aggenda Atendimento = R$ 1.437,84/ano (R$ 119,82/mês); app + Aggenda Secretária = R$ 2.397,84/ano (R$ 199,82/mês). O checkout de testes de R$ 5,00 permanece preservado.

## Prioridade atual: contratação da clínica de testes

O usuário pediu preservar o valor atual de **R$ 5,00** para a clínica contratar e testar os fluxos necessários. Não substituir esse valor pela tabela comercial antes de concluir os testes e receber orientação para a mudança.

Conferência local em 21/10/2026: `src/lib/billing-plans.ts` define fallback mensal de 5 reais. A variável `ASAAS_PLAN_MONTHLY_VALUE`, quando presente, prevalece sobre esse fallback. Esta conferência não confirma o valor efetivo da variável em produção. Não foram alteradas configurações de cobrança nem realizadas compras.

O checkout atual prevê recorrência para mensal no cartão e pagamento avulso para Pix. O valor de teste não implica gratuidade, cobrança única ou habilitação de recursos ainda não homologados. Preservar as condições visíveis no checkout.

## Tabela de lançamento aprovada

Valores em reais. Semestral tem 10% de desconto; anual tem 20%. Colunas de equivalentes mensais não representam cobrança mensal sem compromisso.

| Produto | Mensal | Equivalente mensal semestral | Total de 6 meses | Equivalente mensal anual | Total de 12 meses |
| --- | ---: | ---: | ---: | ---: | ---: |
| App para 1 profissional | 49,90 | 44,91 | 269,46 | 39,92 | 479,04 |
| Cada profissional adicional | 19,90 | 17,91 | 107,46 | 15,92 | 191,04 |
| NFS-e: 50 notas/mês | 29,90 | 26,91 | 161,46 | 23,92 | 287,04 |
| NFS-e: 150 notas/mês | 49,90 | 44,91 | 269,46 | 39,92 | 479,04 |
| NFS-e: 500 notas/mês | 99,90 | 89,91 | 539,46 | 79,92 | 959,04 |
| Assinatura eletrônica: 50 documentos/mês | 19,90 | 17,91 | 107,46 | 15,92 | 191,04 |
| ICP-Brasil: por profissional (condicional) | 19,90 | 17,91 | 107,46 | 15,92 | 191,04 |
| Aggenda Atendimento: informações e link para agendar | 99,90 | 89,91 | 539,46 | 79,92 | 959,04 |
| Aggenda Secretária: atendimento e agendamento na conversa | 199,90 | 179,91 | 1.079,46 | 159,92 | 1.919,04 |

App obrigatório; módulos opcionais contratáveis posteriormente. O Aggenda Secretária inclui as funções do Aggenda Atendimento: não cobrar ambos pelo mesmo canal. Uma empresa/unidade como base da oferta; uma conexão WhatsApp por agente contratado. Cobrar profissional com agenda ativa, sem tratar recepcionistas e administradores como profissionais adicionais.

App: uma agenda profissional, um acesso administrativo e um de recepção, além do acesso profissional; clientes, procedimentos/categorias, produtos, agenda, portal, financeiro, pacotes, comissões, estoque, modelos e geração de documentos conforme disponibilidade; suporte em horário comercial.

## Franquias e adicionais

- NFS-e: por CNPJ; somente notas autorizadas consomem franquia. Rejeições e repetição técnica não geram nova unidade. Excedente: 0,59 no pacote 50; 0,49 no pacote 150; 0,39 no pacote 500.
- Assinatura eletrônica: documento concluído, até três signatários; rascunho não consome. Pacote extra: 100 documentos por 19,90.
- Aggenda Atendimento ou Aggenda Secretária: 1.000 respostas automatizadas/mês. Texto, lista ou documento enviados pelo agente contam como resposta; mensagens recebidas não contam. Pacote extra proposto: 500 respostas por 49,90, sujeito à validação de custos.
- Franquias renovam mensalmente, inclusive em contratos semestrais/anuais; não acumulam.
- Avisos em 80% e 100%; compra expressa de extras, sem cobrança surpresa. Não aplicar descontos de prazo aos excedentes/pacotes avulsos automaticamente.
- Tarifas Meta, SMS, certificado e autenticações especiais devem ser informadas separadamente.

## Experiência gratuita aprovada

- App: 30 dias corridos, sem cartão e sem cobrança automática ao final; até três profissionais durante o teste.
- Assinatura eletrônica: até dez documentos concluídos.
- Aggenda Atendimento ou Aggenda Secretária: até 100 respostas em um número conectado. Contar o período de teste do agente a partir da conexão do canal.
- NFS-e: demonstração em homologação; até cinco notas reais somente após habilitação fiscal.
- ICP-Brasil: teste somente após homologação e com certificado válido do profissional.
- Apresentar custos externos antes da ativação. Ao final, cliente escolhe profissionais e módulos; não converter todos os recursos experimentados em cobranças.

## Pagamento e alterações futuras

Mensal recorrente; semestral/anual antecipados, com Pix e cartão como meios iniciais. Mostrar equivalente mensal e total do período juntos. Parcelamento depende de análise de taxas. Adicionais posteriores com cobrança proporcional até renovação; reduções e retirada de módulos na próxima renovação do período contratado. Formalizar cancelamento/restituição no contrato antes da oferta.

## Condições técnicas e econômicas preservadas

Esta aprovação não elimina as condições da proposta: medir custos reais de IA, infraestrutura, suporte, impostos, tarifas e assinaturas. Pacotes fiscais pressupõem emissão própria de baixo custo ou fornecedor negociado; cobrar 49,90 por 150 notas não é viável se o fornecedor cobrar 0,49 por nota. Assinaturas eletrônicas pressupõem fluxo próprio; fornecedor terceirizado pode exigir revisão. ICP-Brasil de 19,90 por profissional é referência preliminar, com certificado separado e preço final dependente do provedor/homologação.

NFS-e e ICP-Brasil só entram em contratação após conclusão e homologação. Não anunciar como disponíveis com base nesta tabela. Revisar consumo e suporte dos primeiros clientes antes de consolidar a oferta. A tabela comercial futura não deve substituir a condição de teste de 5 reais agora.

## Referências da pesquisa

Consultadas em 21/10/2026; valores de terceiros podem mudar:

- https://www.simplesagenda.com.br/site/
- https://quaddro.com.br/planos
- https://zapsign.com.br/planos-pre%C3%A7os
- Contexto técnico: `docs/nfse-apuracao-custos.md`, `docs/nfse-homologacao.md`, `docs/plano-assinatura-icp-brasil.md`.

## Nomes comerciais dos agentes

Adotados na página comercial: **Aggenda Atendimento** (código interno `chat_ai`, antigo B) e **Aggenda Secretária** (código interno `core_ai`, antigo A). A/B eram apenas identificadores de construção e não devem aparecer na oferta ao cliente. Códigos internos, capacidades, preços e checkout permanecem iguais.
