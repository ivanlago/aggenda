# Profissional parceiro — suporte documental e apuração

A aba própria fica em Equipe > Editar membro > Profissional parceiro. Não utiliza a comissão comercial como cota-parte fiscal.

Implementado:
- Contexto da Lei 13.352/2016 e das Resoluções CGSN 137/2017 e 140/2018, com links oficiais.
- Declaração de responsabilidade; marcação não certifica o enquadramento.
- Identificação, início/fim opcional, encerramento, órgão/data/protocolo de homologação e referência HTTPS do contrato.
- Declarações sobre atividade, duas testemunhas, cláusulas obrigatórias e regularidade fiscal.
- Percentual contratual por serviço, sem sugestão automática baseada na comissão comercial.
- Apuração assistida por recebimento efetivo e valor atribuível ao serviço. Validação documental na data do recebimento.
- Cotas separadas da clínica e do parceiro, retenção informada com orientação contábil e líquido teórico do repasse.
- Memória imutável dos valores, CNPJ, contrato e percentual da apuração; alterações futuras não reescrevem o registro.
- Referências das notas ao consumidor e do parceiro ao salão, com pendência documental explícita. A referência não é emissão ou validação fiscal.
- Estorno com motivo, preservação de histórico, auditoria e prevenção de duplicação/excesso entre parceiros do mesmo recebimento.
- Recebimentos posteriormente cancelados deixam de compor os totais do demonstrativo e são sinalizados para revisão.

Limites operacionais ainda existentes (não anunciar conformidade fiscal automática):
- O demonstrativo não efetua repasse bancário, recolhimento tributário ou lançamento financeiro duplicado.
- O DRE atual não é ajustado pela apuração auxiliar; a segregação tributária deve ser conferida pela contabilidade.
- A emissão de NFS-e em produção já era bloqueada no projeto, aguardando homologação fiscal dos conectores. Não se removeu esse bloqueio.
- Para emissão integrada do regime: homologar a discriminação das cotas e CNPJ em cada conector municipal/nacional, revisar base tributável com assessoria, implementar a vinculação fiscal com estornos e só então habilitar produção.
- Emissão em nome do profissional requer seu próprio cadastro/autorização fiscal. O certificado da clínica não representa automaticamente o parceiro.
- Contrato e homologação são providenciados pelas partes/órgãos competentes; o Aggenda registra dados declarados e não faz homologação jurídica.

Migração: 0109_partner_contracts_and_allocations.sql. Cadastros anteriores ficam com contrato vazio; não recebem declarações ou homologação presumidas. Script apply-partnership-migration.mjs valida preservação dos registros antes/depois.

Validação: tests/partnership-compliance.test.ts executa a migração e as ações reais em PGlite com dados fictícios, autenticação simulada e nenhum envio externo. Cobre vigência, permissões, isolamento, duplicidade, limites de alocação, retenções, referências, estorno e auditoria.
