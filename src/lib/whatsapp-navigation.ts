export type NavigationOption = { id: string; title: string };
export type NavigationState = { options: NavigationOption[]; page?: number; categoryId?: string };
export type NavigationService = {
  id: string; name: string; shortName: string | null; categoryId: string | null;
  description: string | null; preparation: string | null; durationMinutes: number; priceInCents: number | null;
};
export type NavigationContext = {
  name: string; core: boolean; bookingUrl: string | null; address: string | null;
  phone: string | null; email: string | null;
  services: NavigationService[]; categories: { id: string; name: string }[];
  products: { id: string; label: string; priceInCents: number }[];
};
export type NavigationReply = {
  reply: string; navigationState?: NavigationState; handoff?: boolean;
  document?: boolean; continueText?: string;
};
export const normalizeNavigationText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function parseNavigationState(value: unknown): NavigationState | undefined {
  if (!value || typeof value !== "object" || !("options" in value) || !Array.isArray(value.options)) return;
  const options = value.options.filter((item): item is NavigationOption => Boolean(item && typeof item.id === "string" && typeof item.title === "string")).slice(0, 10);
  return { options };
}

function menu(reply: string, options: NavigationOption[]): NavigationReply {
  return { reply: `${reply}\n\n${options.map((option, index) => `${index + 1} - ${option.title}`).join("\n")}\n\nVocê também pode escrever o que precisa.`, navigationState: { options } };
}

function home(context: NavigationContext): NavigationReply {
  return menu(`Olá! Você está falando com ${context.name}. Como podemos ajudar?`, [
    ...(context.services.length ? [{ id: "nav:services:0", title: context.core ? "Agendar um atendimento" : "Procedimentos/serviços" }] : []),
    { id: "nav:appointments", title: "Meus agendamentos" },
    ...(context.products.length ? [{ id: "nav:products", title: "Produtos" }] : []),
    { id: "nav:location", title: "Unidade e informações" },
    { id: "nav:human", title: "Falar com a equipe" },
  ]);
}

function bookingLink(context: NavigationContext, serviceId?: string): string {
  if (!context.bookingUrl) return "O agendamento online não está habilitado no momento. Digite EQUIPE para solicitar atendimento.";
  const url = new URL(context.bookingUrl);
  url.searchParams.set("novo", "1");
  if (serviceId) url.searchParams.set("servico", serviceId);
  url.hash = "novo-agendamento";
  return `Consulte os horários e conclua o agendamento na sua área do cliente:\n${url.toString()}\nO agendamento só estará concluído após a confirmação na página. O acesso exige a validação da sua identidade.`;
}

function pageMenu(title: string, entries: NavigationOption[], page: number, prefix: string): NavigationReply {
  const lastPage = Math.max(0, Math.ceil(entries.length / 7) - 1);
  const current = Math.max(0, Math.min(page, lastPage));
  return menu(`${title}${lastPage ? ` (página ${current + 1}/${lastPage + 1})` : ""}`, [
    ...entries.slice(current * 7, current * 7 + 7),
    ...(current < lastPage ? [{ id: `${prefix}:${current + 1}`, title: "Próxima página" }] : []),
    ...(current ? [{ id: `${prefix}:${current - 1}`, title: "Página anterior" }] : []),
    { id: "nav:home", title: "Menu principal" },
  ]);
}

export function navigateWhatsApp(context: NavigationContext, text: string, state?: NavigationState): NavigationReply | null {
  const normalized = normalizeNavigationText(text).replace(/[!.?,;:]+$/g, "");
  const numeric = /^\d+$/.test(normalized) ? state?.options[Number(normalized) - 1]?.id : undefined;
  // Interactive IDs are accepted only when offered in the preceding message.
  let action = numeric ?? (state?.options.find(item => item.id === text)?.id);
  if (/^(oi|ola|bom dia|boa tarde|boa noite|hey|hello|menu|inicio|voltar)$/.test(normalized)) action = "nav:home";
  if (/^(equipe|humano|atendente|falar com (a |nossa )?equipe|nao sei( qual escolher)?)$/.test(normalized)) action = "nav:human";
  if (/^(produtos|catalogo( de produtos)?)$/.test(normalized)) action = "nav:products";
  if (/^(unidades?|endereco|localizacao|informacoes( da empresa)?)$/.test(normalized)) action = "nav:location";
  if (/^(procedimentos?|servicos?|(quero |gostaria de )?(agendar|marcar)( um atendimento)?)$/.test(normalized)) action = "nav:services:0";
  if (/^(meus agendamentos|minhas consultas)$/.test(normalized)) action = "nav:appointments";
  if (!action && !context.core && /\b(agendar|marcar|reservar|reagendar|remarcar|cancelar|confirmar|meus agendamentos)\b/.test(normalized)) {
    const selected = context.services.filter(service => [service.name, service.shortName].some(name => name && normalized.includes(normalizeNavigationText(name)))).sort((left, right) => right.name.length - left.name.length)[0];
    return { reply: /reagendar|remarcar|cancelar|confirmar|meus agendamentos/.test(normalized)
      ? context.bookingUrl ? `Consulte e gerencie seus agendamentos na sua área do cliente: ${context.bookingUrl}\nValide seu acesso para proteger seus dados. Se precisar de ajuda, digite EQUIPE.` : bookingLink(context)
      : bookingLink(context, selected?.id) };
  }
  if (!action) {
    const matches = context.services.filter(service => [service.name, service.shortName].some(name => name && normalizeNavigationText(name) === normalized));
    if (matches.length === 1) action = `nav:service:${matches[0].id}`;
  }
  if (action === "nav:home") return home(context);
  if (action === "nav:human") return { reply: "Sua solicitação foi encaminhada à equipe. O retorno será feito no horário de atendimento. Você pode deixar sua dúvida nesta conversa.", handoff: true };
  if (action === "nav:location") return menu([
    context.name, context.address ? `Endereço: ${context.address}` : "Endereço ainda não informado.",
    context.phone ? `Contato: ${context.phone}` : "", context.email ? `E-mail: ${context.email}` : "",
    "Para confirmar os horários de atendimento ou obter outras informações, selecione Falar com a equipe.",
  ].filter(Boolean).join("\n"), [{ id: "nav:human", title: "Falar com a equipe" }, { id: "nav:home", title: "Menu principal" }]);
  if (action === "nav:appointments") return context.core
    ? menu("O que deseja fazer com seus agendamentos?", [
      { id: "nav:upcoming", title: "Consultar agendamentos" }, { id: "nav:reschedule", title: "Reagendar" },
      { id: "nav:cancel", title: "Cancelar" }, { id: "nav:confirm", title: "Confirmar presença" }, { id: "nav:home", title: "Menu principal" },
    ]) : { reply: context.bookingUrl ? `Consulte, reagende, cancele ou confirme presença na sua área do cliente:\n${context.bookingUrl}\nValide seu acesso. Para ajuda, digite EQUIPE.` : bookingLink(context) };
  const commands: Record<string, string> = { "nav:upcoming": "Meus próximos agendamentos", "nav:reschedule": "Quero reagendar", "nav:cancel": "Quero cancelar meu agendamento", "nav:confirm": "Quero confirmar presença no meu agendamento" };
  if (action && commands[action] && context.core) return { reply: "", continueText: commands[action] };
  if (action === "nav:products") return context.products.length
    ? { reply: "Catálogo atualizado em anexo. Consulte a disponibilidade e confirme o valor com nossa equipe antes de concluir a compra. Os preços podem sofrer alterações. Deseja falar com a equipe sobre algum produto? Digite EQUIPE. Para voltar, digite MENU.", document: true }
    : { reply: "Não há produtos disponíveis para venda no catálogo neste momento. Digite MENU para voltar ou EQUIPE para solicitar atendimento." };
  if (action?.startsWith("nav:services:")) {
    const page = Number(action.split(":")[2]) || 0;
    const usedCategories = context.categories.filter(category => context.services.some(service => service.categoryId === category.id));
    if (context.services.length > 7 && usedCategories.length) {
      return pageMenu("Selecione a categoria do procedimento/serviço:", [
        ...usedCategories.map(category => ({ id: `nav:category:${category.id}:0`, title: category.name })),
        ...(context.services.some(service => !service.categoryId) ? [{ id: "nav:category:none:0", title: "Outros procedimentos" }] : []),
        { id: "nav:human", title: "Não sei qual escolher" },
      ], page, "nav:services");
    }
    return pageMenu("Selecione o procedimento/serviço:", [...context.services.map(service => ({ id: `nav:service:${service.id}`, title: service.name })), { id: "nav:human", title: "Não sei qual escolher" }], page, "nav:services");
  }
  if (action?.startsWith("nav:category:")) {
    const [, , categoryId, page] = action.split(":");
    const rows = context.services.filter(service => (service.categoryId ?? "none") === categoryId);
    return pageMenu("Selecione o procedimento/serviço:", [...rows.map(service => ({ id: `nav:service:${service.id}`, title: service.name })), { id: "nav:human", title: "Não sei qual escolher" }], Number(page) || 0, `nav:category:${categoryId}`);
  }
  if (action?.startsWith("nav:service:") || action?.startsWith("nav:book:")) {
    const service = context.services.find(item => item.id === action!.split(":")[2]);
    if (!service) return { reply: "Esse procedimento não está mais disponível. Digite MENU para consultar o catálogo atualizado." };
    if (action.startsWith("nav:book:") && context.core) return { reply: "", continueText: `Quero agendar ${service.name}` };
    const details = [service.name, service.description, `Duração: ${service.durationMinutes} minutos.`, service.priceInCents !== null ? `Preço: ${money(service.priceInCents)}.` : "Preço: consulte a equipe.", service.preparation ? `Preparação: ${service.preparation}` : ""].filter(Boolean).join("\n");
    return context.core ? menu(details, [{ id: `nav:book:${service.id}`, title: "Prosseguir ao agendamento" }, { id: "nav:human", title: "Falar com a equipe" }, { id: "nav:home", title: "Menu principal" }]) : { reply: `${details}\n\n${bookingLink(context, service.id)}` };
  }
  if (normalized.length > 2) {
    const matches = context.products.filter(item => normalizeNavigationText(item.label).includes(normalized));
    if (matches.length) return { reply: `${matches.slice(0, 8).map(item => `${item.label}: ${money(item.priceInCents)}`).join("\n")}\nConsulte disponibilidade e confirme o valor antes de comprar. Digite PRODUTOS para receber o catálogo ou EQUIPE para solicitar atendimento.` };
  }
  if ((state && /^\d+$/.test(normalized)) || text.startsWith("nav:")) return home(context);
  return null;
}
