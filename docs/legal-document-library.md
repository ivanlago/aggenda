# Biblioteca jurídica automática

Nove modelos nativos são instalados para novas organizações. Para cadastros existentes, os modelos faltantes ficam disponíveis automaticamente ao abrir as páginas de Documentos. Atualizações explícitas dos textos padrão ficam em Configurações → Documentos → Atualizar biblioteca de modelos. A inicialização é serializada por organização para evitar cópias concorrentes e preserva modelos personalizados. O script `scripts/install-legal-document-presets.ts` realiza a atualização somente dos modelos nativos da organização informada.

Os modelos são bases editáveis por duplicação e devem ser revisados pelo responsável técnico e assessoria jurídica conforme procedimentos, profissão e operação da clínica. O consentimento é individualizado por procedimento: não há catálogo de riscos presumidos ou gerados automaticamente.

## Dados e emissão

Identificação da clínica e paciente, registro do profissional, nome, descrição, preparo, duração e preço do procedimento vêm dos cadastros. Quantidade e valores são revisáveis; o total é calculado em centavos. Os demais campos são específicos de cada modelo. O aviso de privacidade registra ciência e não consentimento genérico; a imagem tem autorização opcional própria; o consentimento não contém renúncia a direitos.

Textos e condições reutilizáveis podem ser salvos por procedimento/modelo (ou por clínica nos modelos sem procedimento), em `responseSchema.defaultsByService`. Nome do responsável, documento, datas, quantidades e valores de acertos não são salvos como padrão. A duplicação preserva os metadados e permite editar o texto do modelo.

O servidor reconsulta os registros dentro da organização e reconstrói o documento, valida campos, datas e valores e armazena o texto congelado, hash e dados estruturados. O envio para assinatura utiliza o fluxo existente; não há assinatura automática pelo profissional ou pela clínica. O documento é enviado ao signatário somente quando o usuário finaliza o envio.

## Fontes para revisão

- Código de Defesa do Consumidor, especialmente arts. 6, 25, 40, 49 e 51: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- LGPD, especialmente arts. 6, 7, 8, 9, 11, 16 e 18: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- Estatuto dos Direitos do Paciente, especialmente arts. 12, 14, 15 e 16: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15378.htm
- Publicidade médica quando aplicável: https://sistemas.cfm.org.br/normas/visualizar/resolucoes/BR/2023/2336

## Verificação

`node --import tsx --test tests/legal-documents.test.ts` verifica cálculos, datas, obrigatoriedade, preenchimento das variáveis e rejeição de campos pendentes.
