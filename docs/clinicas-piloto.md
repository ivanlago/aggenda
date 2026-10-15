# Preparação para estética de pequeno porte e consultório particular

Implementação de 15/10/2026. Alterações locais, sem migrações ou operações executadas no banco conectado.

## Implantação

1. Ensaiar o fluxo habitual de migração em banco isolado e com backup recuperável. Aplicar `0072_clinical_workspace` e `0073_clinical_attachments` juntamente das anteriores pendentes. A 0072 cria índices compostos antes das FKs e inclui gatilhos de preservação das versões clínicas; não reordenar os comandos automaticamente.
2. Vincular cada usuário clínico ao profissional ativo em **Equipe/Profissionais**. O registro finalizado da consulta e a emissão profissional exigem esse vínculo com o responsável pelo atendimento. Cadastros médicos precisam de CRM e UF. A conferência do cadastro não consulta a situação do médico no conselho nem comprova habilitação para procedimentos.
3. Conferir os papéis da equipe: `owner` e `admin` mantêm acesso clínico global; atribuí-los somente a pessoas autorizadas a esse acesso. `professional` acessa pacientes vinculados à sua agenda. Recepção, gerente comercial, financeiro e demais papéis operacionais não recebem acesso ao prontuário, fotos ou documentos clínicos. Permissões personalizadas por usuário continuam fora deste escopo.
4. Configurar `SIGNATURE_STORAGE_KEYS` e `SIGNATURE_STORAGE_ACTIVE_KEY` no servidor para os PDFs privados, com chaves aleatórias estáveis e backup separado. São chaves de criptografia de arquivos, não certificados profissionais. A configuração já usada nos PDFs de assinatura também protege laudos; não reutilizar chaves fiscais ou de login. Sem essa configuração o upload não é habilitado na interface.
5. Testar em celular e computador com dados sintéticos: consulta com médico, atendimento estético, recepção administrativa, outra clínica e profissional sem vínculo com o paciente. Repetir o percurso com o primeiro cliente antes da adoção diária.

## Fluxo clínico

- O resumo aparece no início do atendimento e no cadastro clínico: alergias, medicamentos, condições em acompanhamento, antecedentes e alertas. “Não verificadas” é diferente de “nenhuma relatada”. Cada revisão registra autoria e data e preserva as anteriores; edição desatualizada é recusada. Respostas antigas da anamnese não preenchem o resumo automaticamente.
- A evolução estruturada possui relato/objetivo, achados, avaliação e plano, além de técnica/procedimento, intercorrências e orientações. Os mesmos campos atendem consulta médica e estética, sem prescrever condutas ou gerar diagnósticos. O profissional escolhe o conteúdo.
- Peso, altura, pressão, frequência cardíaca, temperatura e saturação pertencem ao registro da consulta. Os limites de entrada verificam formato/faixas amplas, sem classificação clínica ou decisão automática. Não sobrescrevem medidas antigas do cadastro.
- Produto aplicado, lote, validade, quantidade/unidade e região ficam ligados à evolução e ao paciente. Trata-se de rastreabilidade declarada pelo profissional; não é gestão de saldo por lote, bloqueio de produto vencido ou recall automatizado. Não há segunda baixa de estoque: o consumo existente por procedimento permanece separado.
- “Finalizar registro” preserva o conteúdo no banco. Correção é registrada por adendo ligado ao original; gatilhos recusam UPDATE/DELETE das evoluções e versões do resumo. Finalização do registro não muda o agendamento e não equivale a assinatura qualificada. A exclusão comum do paciente pode ser impedida pelas referências clínicas; retenção/descarte exigem fluxo controlado próprio.
- A data de retorno no registro é apenas anotação clínica. O agendamento continua na agenda; é possível cadastrar serviços próprios de retorno com duração/preço definidos pela clínica. Os retornos por procedimento existentes continuam funcionando. Não foi criada cobrança automática ou regra universal de retorno médico.

## Laudos e exames

PDFs de até 3 MiB, legíveis e sem senha, são anexados ao paciente. Os bytes são criptografados no armazenamento privado existente e conferidos por SHA-256 no download. Download exige sessão, permissão clínica e vínculo com o paciente; é servido como anexo e sem cache. Upload e sua auditoria são transacionais. Um PDF externo anexado não é autenticado ou validado como assinatura ICP pelo Aggenda.

A indicação “revisado” registra usuário e data e não substitui evolução ou conduta. O arquivo original é preservado. Não há consulta automática a laboratórios, antivírus de anexos, OCR, interpretação de resultados, entrega pública desses anexos ou fila global de pendências nesta entrega. Não carregar anexos de origem não confiável como se tivessem passado por inspeção de conteúdo.

## Limites da interface e operação

O resumo mostra 10 revisões recentes; a lista clínica, 100 registros; os laudos, 50 anexos recentes. O restante permanece no banco, mas consulta paginada e exportação completa do prontuário ainda são evoluções necessárias para volumes maiores. Os CSV/XLSX atuais continuam sendo exportações de cadastros, não de todo o prontuário.

Anotações e documentos antigos não foram reescritos. Campos de observações gerais do cadastro e agendamento continuam administrativos: revisar registros históricos que tenham misturado informação de saúde nesses campos. Fotos novas usam o armazenamento autenticado existente; URLs externas históricas precisam de revisão específica de privacidade. As novas permissões não tornam uma URL externa previamente pública em arquivo privado.

As proteções não substituem teste de restauração, monitoramento e suporte. O piloto deve ter responsável pela operação, canal de suporte e procedimento de contingência. Não foram configurados backups ou notificações externas nesta tarefa.

## Verificação

`npm run test:clinical` usa PostgreSQL isolado e dados sintéticos. Verifica migrações reais, FKs entre organizações, revisão concorrente, preservação do original, adendos, repetição de envio, permissões reais das ações, upload transacional, download privado, corrupção e renderização inicial do componente. Também executar TypeScript/lint. Esses testes não exercitam navegador autenticado, armazenamento Cloudinary real, laboratório, conformidade regulatória ou rotina de uma clínica real.

O produto permanece voltado à operação particular ambulatorial descrita. Convênios/TISS, teleconsulta, assistência automatizada a diagnóstico/prescrição e gestão hospitalar não foram habilitados. Assinaturas qualificadas e NFS-e mantêm seus fluxos e condições de homologação próprios.
