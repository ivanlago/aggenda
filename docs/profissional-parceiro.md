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
- O DRE gerencial usa recebimento/pagamento (vencimento apenas para legados sem data), exclui a cota bruta dos parceiros da receita e não trata repasses/recolhimentos vinculados como despesa operacional. A segregação gerencial não determina a base tributária municipal.
- Para evitar dupla contagem, vincule à apuração pagamentos manuais já realizados, de valor igual ao líquido/tributo. Desvinculação preserva o lançamento financeiro e registra motivo em auditoria.
- Apurações cujo recebimento foi alterado e vínculos cujo pagamento mudou de valor são sinalizados no DRE; ajustes inconsistentes não são aplicados silenciosamente.
- A emissão de NFS-e em produção já era bloqueada no projeto, aguardando homologação fiscal dos conectores. Não se removeu esse bloqueio.
- Os rascunhos nacional e Salvador recebem automaticamente a discriminação dos serviços, cotas-partes e CNPJ a partir das apurações. A memória é criptografada no rascunho. Mudança/estorno de apuração exige nova preparação antes do envio.
- Esta preparação em sandbox mantém o valor integral no cálculo do conector e não aplica dedução tributária automática da parceria. A interface avisa expressamente. É preciso homologar o tratamento da base tributável e das retenções no canal específico antes de habilitar produção.
- Emissão em nome do profissional requer seu próprio cadastro/autorização fiscal. O certificado da clínica não representa automaticamente o parceiro.
- Contrato e homologação são providenciados pelas partes/órgãos competentes; o Aggenda registra dados declarados e não faz homologação jurídica.

Migração: 0109_partner_contracts_and_allocations.sql. Cadastros anteriores ficam com contrato vazio; não recebem declarações ou homologação presumidas. Script apply-partnership-migration.mjs valida preservação dos registros antes/depois.

Validação: tests/partnership-compliance.test.ts executa a migração e as ações reais em PGlite com dados fictícios, autenticação simulada e nenhum envio externo. Cobre vigência, permissões, isolamento, duplicidade, limites de alocação, retenções, referências, estorno e auditoria.

Atualização 0110: professional_fiscal_outflows registra referências aos pagamentos existentes, com unicidade, validação de valor/tipo/empresa e auditoria. Não gera transferências bancárias. A apuração não pode ser estornada com repasse vinculado.

Validação adicional: partnership-accounting.test.ts cobre receita própria, retenções, dupla contagem, estornos, alteração de fonte e memória fiscal. nfse.test.ts verifica a discriminação dentro do XML preparado e a recusa de envio após mudança da apuração; as suítes nacional/Salvador continuam validando os XMLs contra os XSDs oficiais.
