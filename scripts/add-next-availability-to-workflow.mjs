import fs from "node:fs";

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  throw new Error("Informe os caminhos de entrada e saída.");
}

const workflow = JSON.parse(fs.readFileSync(input, "utf8"));
const byName = (name) => {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`Nó não encontrado: ${name}`);
  return node;
};

const agent = byName("AI Agent");
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage
  .replace(
    'Quando houver procedimento, profissional e data, use action "check_times".',
    'Quando houver procedimento, profissional e data, use action "check_times". Quando o cliente perguntar pela próxima data disponível, preserve a última data consultada e também use action "check_times"; a ferramenta buscará automaticamente a próxima data com horários. Nunca diga que não consegue consultar datas futuras.'
  )
  .replace(
    'Atenda sempre em português do Brasil, com mensagens curtas e cordiais.',
    'Atenda sempre em português do Brasil, com mensagens curtas e cordiais. No primeiro contato ou quando o cliente enviar apenas uma saudação, responda exatamente: "Olá! Seja bem-vindo(a) à Clínica Aura Estética. Como posso ajudar você hoje? Temos diversos procedimentos, como limpeza de pele, massagens e tratamentos faciais. Gostaria de conhecer algum deles ou agendar um horário?" Não encurte essa mensagem inicial.'
  );

const times = byName("Buscar horários");
const query = times.parameters.queryParameters.parameters;
if (!query.some((item) => item.name === "findNext")) {
  query.push({ name: "findNext", value: "true" });
}
if (!query.some((item) => item.name === "searchDays")) {
  query.push({ name: "searchDays", value: "60" });
}

byName("Formatar horários").parameters.jsCode = `const slots = $json.availableTimes ?? [];
const timezone = $json.timezone || 'America/Bahia';
const availableTimes = slots.map((iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)));
const decision = $('Interpretar decisão da IA').item.json;
const formatDate = (value) => {
  const [year, month, day] = String(value).split('-');
  return \`${"${day}/${month}/${year}"}\`;
};
const requestedDate = formatDate($json.requestedDate ?? decision.date);
const availableDate = formatDate($json.date ?? decision.date);
const professionalName = decision.professionalName ?? 'o profissional selecionado';
let reply;
if (availableTimes.length && $json.foundNextDate) {
  reply = \`Não encontrei horários para ${"${professionalName}"} em ${"${requestedDate}"}. A próxima data disponível é ${"${availableDate}"}, com estes horários:\\n\\n${"${availableTimes.join(', ')}"}\\n\\nQual horário você gostaria de escolher?\`;
} else if (availableTimes.length) {
  reply = \`Para ${"${availableDate}"}, ${"${professionalName}"} possui estes horários disponíveis:\\n\\n${"${availableTimes.join(', ')}"}\\n\\nQual horário você gostaria de escolher?\`;
} else {
  reply = \`Não encontrei horários disponíveis para ${"${professionalName}"} entre ${"${requestedDate}"} e os próximos 60 dias. Deseja escolher outro profissional?\`;
}
return [{ json: { reply } }];`;

fs.writeFileSync(output, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`Workflow gravado em ${output}`);
