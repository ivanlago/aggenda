import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const sourcePath = process.argv[2] ?? "Aggenda - Chatbot - corrigido.json";
const outputDir = process.argv[3] ?? "workflows/commercial";
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const clone = (value) => structuredClone(value);
const id = () => crypto.randomUUID();
const byName = (workflow, name) => workflow.nodes.find((node) => node.name === name);
const keepNodes = (workflow, names) => {
  const allowed = new Set(names);
  workflow.nodes = workflow.nodes.filter((node) => allowed.has(node.name));
  workflow.connections = Object.fromEntries(
    Object.entries(workflow.connections).filter(([name]) => allowed.has(name))
  );
  for (const connection of Object.values(workflow.connections)) {
    for (const groups of Object.values(connection)) {
      for (const group of groups) {
        for (let index = group.length - 1; index >= 0; index -= 1) {
          if (!allowed.has(group[index].node)) group.splice(index, 1);
        }
      }
    }
  }
};
const connect = (workflow, sourceName, targetName, type = "main", output = 0) => {
  workflow.connections[sourceName] ??= {};
  workflow.connections[sourceName][type] ??= [];
  workflow.connections[sourceName][type][output] ??= [];
  workflow.connections[sourceName][type][output].push({ node: targetName, type, index: 0 });
};
const setMainChain = (workflow, names) => {
  for (const name of names) delete workflow.connections[name];
  for (let index = 0; index < names.length - 1; index += 1) {
    connect(workflow, names[index], names[index + 1]);
  }
};
const codeNode = (name, jsCode, position) => ({
  parameters: { jsCode },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position,
  id: id(),
  name,
});
const httpNode = (name, url, position, method = "POST") => ({
  parameters: {
    method,
    url,
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: method !== "GET",
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json) }}",
    options: {},
  },
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.3,
  position,
  id: id(),
  name,
});
const base = (name) => {
  const workflow = clone(source);
  workflow.id = undefined;
  workflow.versionId = id();
  workflow.name = name;
  workflow.active = false;
  workflow.pinData = {};
  delete workflow.meta;
  delete workflow.tags;
  return workflow;
};
const normalizeSender = (workflow) => {
  const send = byName(workflow, "Send message");
  if (send) {
    send.parameters.recipientPhoneNumber =
      "={{ $('Receber mensagem WhatsApp').item.json.messages[0].from }}";
  }
  const client = byName(workflow, "Buscar ou criar cliente");
  const phone = client?.parameters?.bodyParameters?.parameters?.find(
    (item) => item.name === "phone"
  );
  if (phone) {
    phone.value = "={{ $('Receber mensagem WhatsApp').item.json.messages[0].from }}";
  }
};
const sanitizeCredentials = (workflow) => {
  for (const node of workflow.nodes) {
    if (!node.credentials) continue;
    for (const credential of Object.values(node.credentials)) delete credential.id;
  }
};
const finalize = (workflow, product, requires) => {
  normalizeSender(workflow);
  sanitizeCredentials(workflow);
  workflow.settings ??= { executionOrder: "v1" };
  workflow.staticData = null;
  workflow.tags = [];
  workflow.description = `Produto ${product}. Recursos: ${requires.join(", ")}. Gerado de ${path.basename(sourcePath)}.`;
  return workflow;
};

const greeting =
  "Olá! Seja bem-vindo(a) à {{companyName}}. Como posso ajudar você hoje? Responda com o número de uma opção:\n\n1. Conhecer serviços\n2. Consultar horário de atendimento\n3. Ver localização\n4. Solicitar contato ou agendamento\n5. Falar com atendente";

function buildChat() {
  const workflow = base("Aggenda Chat - Horizontal");
  keepNodes(workflow, ["Receber mensagem WhatsApp", "AI Agent", "Send message"]);
  const router = byName(workflow, "AI Agent");
  router.name = "Atendimento determinístico";
  router.type = "n8n-nodes-base.code";
  router.typeVersion = 2;
  router.parameters = {
    jsCode: `const input = $('Receber mensagem WhatsApp').item.json;
const text = String(input.messages?.[0]?.text?.body ?? '').trim().toLowerCase();
const config = {
  companyName: 'CONFIGURE_NOME_DA_EMPRESA',
  services: ['CONFIGURE_SERVIÇO_1', 'CONFIGURE_SERVIÇO_2'],
  businessHours: 'CONFIGURE_HORÁRIO_DE_ATENDIMENTO',
  address: 'CONFIGURE_ENDEREÇO_E_LINK_DO_MAPS',
};
const menu = ${JSON.stringify(greeting)}.replace('{{companyName}}', config.companyName);
let reply = menu;
if (/^(1|servi[cç]os?|procedimentos?)$/.test(text)) reply = 'Nossos serviços são:\\n\\n' + config.services.map((value, index) => \`${"${index + 1}. ${value}"}\`).join('\\n') + '\\n\\nDigite menu para voltar.';
else if (/^(2|hor[aá]rio|funcionamento)$/.test(text)) reply = config.businessHours + '\\n\\nDigite menu para voltar.';
else if (/^(3|endere[cç]o|localiza[cç][aã]o)$/.test(text)) reply = config.address + '\\n\\nDigite menu para voltar.';
else if (/^(4|agendar|agendamento|contato)$/.test(text)) reply = 'Informe seu nome, o serviço desejado e a melhor data ou turno. A equipe confirmará a disponibilidade.';
else if (/^(5|atendente|humano)$/.test(text)) reply = 'Certo. Pausei o atendimento automático e encaminhei sua conversa para nossa equipe.';
return [{ json: { reply, product: 'chat', handoffRequested: /^(5|atendente|humano)$/.test(text) } }];`,
  };
  workflow.connections = {};
  setMainChain(workflow, [
    "Receber mensagem WhatsApp",
    "Atendimento determinístico",
    "Send message",
  ]);
  return finalize(workflow, "CHAT", ["chat.menus", "chat.faq", "chat.handoff"]);
}

function configureAgent(agent, product, capabilities) {
  agent.parameters.promptType = "define";
  agent.parameters.text =
    "=Mensagem recebida:\n{{ $('Receber mensagem WhatsApp').item.json.messages[0].text.body }}";
  agent.parameters.options.systemMessage = `Você é o atendimento virtual de uma empresa que usa a plataforma Aggenda.

Produto: ${product}.
Capacidades autorizadas: ${capabilities}.

Atenda em português do Brasil. Use somente informações aprovadas no prompt ou nas ferramentas. Nunca invente preços, horários, políticas ou resultados. Nunca forneça diagnóstico médico ou parecer jurídico definitivo. Quando não houver informação suficiente, apresente o menu ou encaminhe para atendimento humano.

Responda sempre com JSON válido, sem bloco de código:
{"action":"reply","reply":"mensagem","intent":"unknown","confidence":0,"data":{}}

Para saudação inicial, use uma mensagem completa que apresente a empresa, os serviços e ofereça atendimento ou agendamento. Para pedir humano, use action "handoff".`;
}

function buildChatAI() {
  const workflow = base("Aggenda Chat + AI - Horizontal");
  keepNodes(workflow, [
    "Receber mensagem WhatsApp",
    "AI Agent",
    "Google Gemini Chat Model",
    "Simple Memory",
    "Interpretar decisão da IA",
    "Send message",
  ]);
  configureAgent(
    byName(workflow, "AI Agent"),
    "Aggenda Chat + AI",
    "FAQ, informações institucionais, coleta de lead e handoff. Não consulte nem altere agenda real."
  );
  workflow.connections = {};
  setMainChain(workflow, [
    "Receber mensagem WhatsApp",
    "AI Agent",
    "Interpretar decisão da IA",
    "Send message",
  ]);
  connect(workflow, "Google Gemini Chat Model", "AI Agent", "ai_languageModel");
  connect(workflow, "Simple Memory", "AI Agent", "ai_memory");
  return finalize(workflow, "CHAT_AI", [
    "chat.menus",
    "chat.faq",
    "chat.handoff",
    "ai.natural_language",
    "ai.knowledge_base",
  ]);
}

const flowCollectorCode = `const input = $('Receber mensagem WhatsApp').item.json;
const phone = String(input.messages?.[0]?.from ?? '');
const text = String(input.messages?.[0]?.text?.body ?? '').trim();
const data = $getWorkflowStaticData('global');
data.sessions ??= {};
const session = data.sessions[phone] ?? { step: 'menu', fields: {} };
let reply;
let execute = false;
if (/^(menu|oi|olá|ola)$/i.test(text) || session.step === 'menu') {
  session.step = 'name'; session.fields = {};
  reply = 'Olá! Vou registrar sua solicitação. Qual é o seu nome?';
} else if (session.step === 'name') {
  session.fields.name = text; session.step = 'service'; reply = 'Qual serviço você procura?';
} else if (session.step === 'service') {
  session.fields.service = text; session.step = 'preference'; reply = 'Qual a melhor data, turno ou horário para contato?';
} else if (session.step === 'preference') {
  session.fields.preference = text; session.step = 'confirm';
  reply = \`Confirma o envio desta solicitação?\\n\\nNome: ${"${session.fields.name}"}\\nServiço: ${"${session.fields.service}"}\\nPreferência: ${"${session.fields.preference}"}\\n\\nResponda sim ou não.\`;
} else if (session.step === 'confirm' && /^(sim|confirmo|confirmar)$/i.test(text)) {
  execute = true; reply = 'Enviando sua solicitação...'; session.step = 'done';
} else if (session.step === 'confirm') {
  session.step = 'menu'; reply = 'Solicitação cancelada. Digite menu para começar novamente.';
} else {
  session.step = 'menu'; reply = 'Solicitação concluída. Digite menu para iniciar outra.';
}
data.sessions[phone] = session;
return [{ json: { action: execute ? 'execute_flow' : 'reply', reply, phone, ...session.fields } }];`;

function buildFlow(ai = false) {
  const workflow = base(ai ? "Aggenda Flow + AI - Horizontal" : "Aggenda Flow - Horizontal");
  const names = ["Receber mensagem WhatsApp", "Send message"];
  if (ai) names.push("AI Agent", "Google Gemini Chat Model", "Simple Memory", "Interpretar decisão da IA");
  keepNodes(workflow, names);
  const decision = ai
    ? byName(workflow, "Interpretar decisão da IA")
    : codeNode("Coletar dados do fluxo", flowCollectorCode, [420, 0]);
  if (!ai) workflow.nodes.push(decision);
  if (ai) {
    configureAgent(
      byName(workflow, "AI Agent"),
      "Aggenda Flow + AI",
      "identificar uma automação publicada e coletar seus campos. Use action execute_flow apenas após confirmação explícita."
    );
  }
  const action = httpNode(
    "Executar automação publicada",
    "CONFIGURE_HTTPS_ENDPOINT_DA_AUTOMACAO",
    [850, 120]
  );
  action.parameters.options = { response: { response: { neverError: true } } };
  const format = codeNode(
    "Confirmar resultado do fluxo",
    `const status = Number($json.statusCode ?? 200);
const success = status >= 200 && status < 300 && $json.success !== false;
return [{ json: { reply: success
  ? ($json.reply ?? 'Sua solicitação foi registrada com sucesso. Nossa equipe dará continuidade ao atendimento.')
  : 'Não foi possível concluir a solicitação agora. Ela foi encaminhada para atendimento humano.' } }];`,
    [1060, 120]
  );
  workflow.nodes.push(action, format);
  workflow.connections = {};
  if (ai) {
    setMainChain(workflow, ["Receber mensagem WhatsApp", "AI Agent", "Interpretar decisão da IA"]);
    connect(workflow, "Google Gemini Chat Model", "AI Agent", "ai_languageModel");
    connect(workflow, "Simple Memory", "AI Agent", "ai_memory");
  } else {
    setMainChain(workflow, ["Receber mensagem WhatsApp", "Coletar dados do fluxo"]);
  }
  const sourceName = ai ? "Interpretar decisão da IA" : "Coletar dados do fluxo";
  const router = clone(byName(source, "Rotear ação"));
  router.id = id();
  router.name = "Rotear automação";
  router.position = [650, 0];
  router.parameters.rules.values = router.parameters.rules.values.slice(0, 2);
  router.parameters.rules.values[0].conditions.conditions[0].rightValue = "reply";
  router.parameters.rules.values[1].conditions.conditions[0].rightValue = "execute_flow";
  workflow.nodes.push(router);
  connect(workflow, sourceName, "Rotear automação");
  connect(workflow, "Rotear automação", "Send message", "main", 0);
  connect(workflow, "Rotear automação", "Executar automação publicada", "main", 1);
  connect(workflow, "Executar automação publicada", "Confirmar resultado do fluxo");
  connect(workflow, "Confirmar resultado do fluxo", "Send message");
  return finalize(workflow, ai ? "FLOW_AI" : "FLOW", [
    "chat.menus",
    "flow.webhooks",
    "flow.retries",
    ...(ai ? ["ai.natural_language", "ai.tool_calling"] : []),
  ]);
}

const deterministicCoreCode = `const input = $('Receber mensagem WhatsApp').item.json;
const phone = String(input.messages?.[0]?.from ?? '');
const text = String(input.messages?.[0]?.text?.body ?? '').trim();
const normalized = text.toLowerCase();
const services = $('Buscar procedimentos').item.json.services ?? [];
const professionals = $('Buscar profissionais').item.json.professionals ?? [];
const data = $getWorkflowStaticData('global');
data.sessions ??= {};
const session = data.sessions[phone] ?? { step: 'menu', fields: {} };
let reply = '';
let action = 'reply';
const pick = (items) => { const number = Number(text); return Number.isInteger(number) && number > 0 ? items[number - 1] : items.find((item) => String(item.name).toLowerCase() === normalized); };
if (/^(oi|olá|ola|menu|in[ií]cio)$/i.test(text) || session.step === 'menu') {
  session.step = 'service'; session.fields = {};
  reply = 'Olá! Seja bem-vindo(a). Qual serviço deseja agendar?\\n\\n' + services.map((item, index) => \`${"${index + 1}. ${item.name}"}\`).join('\\n');
} else if (session.step === 'service') {
  const selected = pick(services);
  if (!selected) reply = 'Não identifiquei o serviço. Responda com o número de uma opção.';
  else { session.fields.serviceId = selected.id; session.fields.serviceName = selected.name; session.step = 'professional'; reply = 'Escolha o profissional:\\n\\n' + professionals.map((item, index) => \`${"${index + 1}. ${item.displayName || item.name}"}\`).join('\\n'); }
} else if (session.step === 'professional') {
  const selected = pick(professionals);
  if (!selected) reply = 'Não identifiquei o profissional. Responda com o número de uma opção.';
  else { session.fields.professionalId = selected.id; session.fields.professionalName = selected.displayName || selected.name; session.step = 'date'; reply = 'Qual data deseja? Envie no formato DD/MM/AAAA.'; }
} else if (session.step === 'date') {
  const match = text.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
  if (!match) reply = 'Informe a data no formato DD/MM/AAAA.';
  else { session.fields.date = \`${"${match[3]}-${match[2]}-${match[1]}"}\`; session.step = 'time'; action = 'check_times'; }
} else if (session.step === 'time') {
  const match = text.match(/^(\\d{1,2}):(\\d{2})$/);
  if (!match) reply = 'Informe um dos horários apresentados no formato HH:mm.';
  else { session.fields.time = \`${"${match[1].padStart(2, '0')}:${match[2]}"}\`; session.step = 'name'; reply = 'Qual é o seu nome completo?'; }
} else if (session.step === 'name') {
  if (text.length < 2) reply = 'Informe seu nome completo.';
  else { session.fields.clientName = text; session.step = 'confirm'; reply = \`Confirma o agendamento?\\n\\nServiço: ${"${session.fields.serviceName}"}\\nProfissional: ${"${session.fields.professionalName}"}\\nData: ${"${session.fields.date.split('-').reverse().join('/')}"} às ${"${session.fields.time}"}\\n\\nResponda sim ou não.\`; }
} else if (session.step === 'confirm' && /^(sim|confirmo|confirmar)$/i.test(text)) {
  action = 'create_appointment'; session.step = 'done';
} else if (session.step === 'confirm') {
  session.step = 'menu'; reply = 'Agendamento cancelado. Digite menu para começar novamente.';
} else {
  session.step = 'menu'; reply = 'Digite menu para iniciar um novo atendimento.';
}
data.sessions[phone] = session;
return [{ json: { action, reply, clientEmail: null, ...session.fields } }];`;

function buildCore(ai = false) {
  const workflow = base(ai ? "Aggenda Core + AI - Horizontal" : "Aggenda Core - Horizontal");
  if (ai) {
    const agent = byName(workflow, "AI Agent");
    agent.parameters.options.systemMessage = agent.parameters.options.systemMessage
      .replaceAll("Clínica Aura Estética", "CONFIGURE_NOME_DA_EMPRESA")
      .replace(
        "Quando o cliente não souber qual profissional escolher",
        "Use os nomes configurados pela empresa para cliente, serviço, profissional e agendamento. Quando o cliente não souber qual profissional escolher"
      );
    return finalize(workflow, "CORE_AI", [
      "core.native_scheduling",
      "ai.natural_language",
      "ai.tool_calling",
    ]);
  }
  keepNodes(workflow, [
    "Receber mensagem WhatsApp",
    "Buscar profissionais",
    "Buscar procedimentos",
    "Rotear ação",
    "Buscar horários",
    "Formatar horários",
    "Buscar ou criar cliente",
    "Criar agendamento",
    "Preparar confirmação",
    "Send message",
  ]);
  const decision = codeNode("Atendimento Core determinístico", deterministicCoreCode, [520, 16]);
  workflow.nodes.push(decision);
  const formatter = byName(workflow, "Formatar horários");
  formatter.parameters.jsCode = formatter.parameters.jsCode.replaceAll(
    "$('Interpretar decisão da IA')",
    "$('Atendimento Core determinístico')"
  );
  formatter.parameters.jsCode = formatter.parameters.jsCode.replace(
    "return [{ json: { reply } }];",
    `const phone = String($('Receber mensagem WhatsApp').item.json.messages?.[0]?.from ?? '');
const state = $getWorkflowStaticData('global');
if (phone && state.sessions?.[phone] && $json.availableTimes?.length) {
  state.sessions[phone].fields.date = $json.date;
}
return [{ json: { reply } }];`
  );
  for (const name of ["Criar agendamento", "Preparar confirmação"]) {
    const node = byName(workflow, name);
    node.parameters = JSON.parse(
      JSON.stringify(node.parameters).replaceAll("Interpretar decisão da IA", "Atendimento Core determinístico")
    );
  }
  workflow.connections = {};
  setMainChain(workflow, [
    "Receber mensagem WhatsApp",
    "Buscar profissionais",
    "Buscar procedimentos",
    "Atendimento Core determinístico",
    "Rotear ação",
  ]);
  connect(workflow, "Rotear ação", "Send message", "main", 0);
  connect(workflow, "Rotear ação", "Buscar horários", "main", 1);
  connect(workflow, "Rotear ação", "Buscar ou criar cliente", "main", 2);
  connect(workflow, "Buscar horários", "Formatar horários");
  connect(workflow, "Formatar horários", "Send message");
  connect(workflow, "Buscar ou criar cliente", "Criar agendamento");
  connect(workflow, "Criar agendamento", "Preparar confirmação");
  connect(workflow, "Preparar confirmação", "Send message");
  return finalize(workflow, "CORE", ["chat.menus", "core.native_scheduling"]);
}

const workflows = [
  ["aggenda-chat.json", buildChat()],
  ["aggenda-chat-ai.json", buildChatAI()],
  ["aggenda-flow.json", buildFlow(false)],
  ["aggenda-flow-ai.json", buildFlow(true)],
  ["aggenda-core.json", buildCore(false)],
  ["aggenda-core-ai.json", buildCore(true)],
];

fs.mkdirSync(outputDir, { recursive: true });
for (const [filename, workflow] of workflows) {
  fs.writeFileSync(path.join(outputDir, filename), `${JSON.stringify(workflow, null, 2)}\n`);
}
console.log(`Gerados ${workflows.length} workflows em ${outputDir}`);
