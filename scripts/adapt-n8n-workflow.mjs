import fs from "node:fs";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("Informe os caminhos de entrada e saída.");

const workflow = JSON.parse(fs.readFileSync(input, "utf8"));
const byName = (name) => workflow.nodes.find((node) => node.name === name);
const baseUrl = "https://aggenda-virid.vercel.app";
const clinicId = "cb69eb9f-b773-4ce6-9182-4cdb7e96c509";

workflow.name = "Aggenda - Chatbot WhatsApp";

const professionals = byName("Buscar médicos");
professionals.name = "Buscar profissionais";
professionals.parameters.url = `${baseUrl}/api/n8n/professionals`;
professionals.parameters.headerParameters.parameters = [{ name: "X-Clinic-Id", value: clinicId }];
professionals.credentials.httpHeaderAuth.name = "Aggenda API - n8n";

const services = structuredClone(professionals);
services.id = crypto.randomUUID();
services.name = "Buscar procedimentos";
services.position = [professionals.position[0] + 220, professionals.position[1]];
services.parameters.url = `${baseUrl}/api/n8n/services`;
workflow.nodes.push(services);

const agent = byName("AI Agent");
agent.parameters.text = `=Mensagem recebida:\n{{ $('Receber mensagem WhatsApp').item.json.messages[0].text.body }}\n\nProfissionais cadastrados:\n{{ JSON.stringify($('Buscar profissionais').item.json.professionals) }}\n\nProcedimentos cadastrados:\n{{ JSON.stringify($('Buscar procedimentos').item.json.services.map(s => ({ id: s.id, name: s.name, description: s.description, durationMinutes: s.durationMinutes, priceInCents: s.priceInCents }))) }}`;
agent.parameters.options.systemMessage = `Você é o assistente virtual de agendamentos da Clínica Aura Estética, no Aggenda.

Atenda sempre em português do Brasil, com mensagens curtas e cordiais. Ajude com apresentação dos procedimentos, profissionais, consulta de horários e criação de agendamentos. Nunca faça diagnósticos, prescrições ou promessas de resultado. Nunca invente procedimentos, profissionais, IDs, preços ou horários: use somente os dados recebidos no prompt.

Para agendar, obtenha: procedimento, profissional, data, horário, nome completo e email opcional. O telefone vem automaticamente do WhatsApp. Quando o cliente não souber qual profissional escolher, apresente apenas os profissionais cadastrados e peça uma escolha.

Quando houver procedimento, profissional e data, use action "check_times". Antes de criar, apresente um resumo contendo procedimento, profissional, data e horário e peça confirmação explícita. Use "create_appointment" somente quando todos os dados estiverem preenchidos e a mensagem atual confirmar explicitamente o resumo imediatamente anterior. Um "sim" fora dessa confirmação não autoriza o agendamento.

Responda sempre com JSON válido, sem bloco de código ou texto adicional:
{
  "action": "reply",
  "reply": "mensagem ao cliente",
  "serviceId": null,
  "serviceName": null,
  "professionalId": null,
  "professionalName": null,
  "date": null,
  "time": null,
  "clientName": null,
  "clientEmail": null
}

Actions permitidas: "reply", "check_times", "create_appointment" e "handoff". Use data YYYY-MM-DD e horário HH:mm. Preserve no JSON os dados já informados na conversa. Formate valores em reais para o cliente. Quando faltar algo, pergunte somente o próximo dado necessário. Para assunto fora do escopo, use "handoff".`;

const interpreter = byName("Interpretar decisão da IA");
interpreter.parameters.jsCode = `const raw = String($json.output ?? '').trim();
const cleaned = raw.replace(/^\`\`\`json\\s*/i, '').replace(/^\`\`\`\\s*/i, '').replace(/\\s*\`\`\`$/i, '').trim();
try {
  return [{ json: { ...JSON.parse(cleaned), rawOutput: raw } }];
} catch {
  return [{ json: { action: 'reply', reply: raw || 'Desculpe, não consegui interpretar sua solicitação. Poderia repetir?', serviceId: null, serviceName: null, professionalId: null, professionalName: null, date: null, time: null, clientName: null, clientEmail: null, rawOutput: raw, parseError: true } }];
}`;

const times = byName("Buscar horários");
times.parameters.url = `${baseUrl}/api/n8n/available-times`;
times.parameters.queryParameters.parameters = [
  { name: "serviceId", value: "={{ $json.serviceId }}" },
  { name: "professionalId", value: "={{ $json.professionalId }}" },
  { name: "date", value: "={{ $json.date }}" },
];
times.parameters.headerParameters.parameters = [{ name: "X-Clinic-Id", value: clinicId }];
times.credentials.httpHeaderAuth.name = "Aggenda API - n8n";

const formatTimes = byName("Formatar horários");
formatTimes.parameters.jsCode = `const slots = $json.availableTimes ?? [];
const availableTimes = slots.map((iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: $json.timezone || 'America/Bahia', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)));
const decision = $('Interpretar decisão da IA').item.json;
const [year, month, day] = String(decision.date).split('-');
const formattedDate = \`${'${day}/${month}/${year}'}\`;
const professionalName = decision.professionalName ?? 'o profissional selecionado';
const reply = availableTimes.length
  ? \`Para ${'${formattedDate}'}, ${'${professionalName}'} possui estes horários disponíveis:\\n\\n${'${availableTimes.join(", ")}'}\\n\\nQual horário você gostaria de escolher?\`
  : \`Não encontrei horários disponíveis para ${'${professionalName}'} em ${'${formattedDate}'}. Deseja consultar outra data?\`;
return [{ json: { reply } }];`;

const client = byName("Buscar ou criar paciente");
client.name = "Buscar ou criar cliente";
client.parameters.url = `${baseUrl}/api/n8n/clients/find-or-create`;
client.parameters.headerParameters.parameters = [{ name: "X-Clinic-Id", value: clinicId }];
client.parameters.bodyParameters.parameters = [
  { name: "name", value: "={{ $json.clientName }}" },
  { name: "email", value: "={{ $json.clientEmail || null }}" },
  { name: "phone", value: "={{ $('Receber mensagem WhatsApp').item.json.messages[0].from === '557191814240' ? '5571991814240' : $('Receber mensagem WhatsApp').item.json.messages[0].from }}" },
  { name: "notes", value: "Atendimento iniciado pelo WhatsApp via Aggenda Chat" },
];
client.credentials.httpHeaderAuth.name = "Aggenda API - n8n";

const appointment = byName("Criar agendamento");
appointment.parameters.url = `${baseUrl}/api/n8n/appointments`;
appointment.parameters.headerParameters.parameters = [{ name: "X-Clinic-Id", value: clinicId }];
appointment.parameters.jsonBody = `={
  "clientId": "{{ $json.client.id }}",
  "serviceId": "{{ $('Interpretar decisão da IA').item.json.serviceId }}",
  "professionalId": "{{ $('Interpretar decisão da IA').item.json.professionalId }}",
  "startsAt": "{{ $('Interpretar decisão da IA').item.json.date + 'T' + $('Interpretar decisão da IA').item.json.time + ':00-03:00' }}",
  "notes": "Criado pelo atendimento no WhatsApp via Aggenda Chat"
}`;
appointment.credentials.httpHeaderAuth.name = "Aggenda API - n8n";

byName("Preparar confirmação").parameters.jsCode = `const appointment = $json.appointment;
const decision = $('Interpretar decisão da IA').item.json;
const [year, month, day] = String(decision.date).split('-');
return [{ json: { reply: \`Agendamento confirmado! ✅\\n\\nProcedimento: ${'${decision.serviceName}'}\\nProfissional: ${'${decision.professionalName}'}\\nData: ${'${day}/${month}/${year}'} às ${'${decision.time}'}\\n\\nCódigo: ${'${appointment.id}'}\` } }];`;

byName("Simple Memory").parameters.sessionKey = "={{ $('Receber mensagem WhatsApp').item.json.messages[0].from + '-aggenda-v1' }}";

workflow.connections["Receber mensagem WhatsApp"].main[0][0].node = "Buscar profissionais";
delete workflow.connections["Buscar médicos"];
workflow.connections["Buscar profissionais"] = { main: [[{ node: "Buscar procedimentos", type: "main", index: 0 }]] };
workflow.connections["Buscar procedimentos"] = { main: [[{ node: "AI Agent", type: "main", index: 0 }]] };
workflow.connections["Rotear ação"].main[2][0].node = "Buscar ou criar cliente";
delete workflow.connections["Buscar ou criar paciente"];
workflow.connections["Buscar ou criar cliente"] = { main: [[{ node: "Criar agendamento", type: "main", index: 0 }]] };

fs.writeFileSync(output, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`Workflow gravado em ${output}`);
