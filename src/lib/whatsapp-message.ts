import type { NavigationOption } from "@/lib/whatsapp-navigation";

export function usesInternalWhatsAppAgent(product: string | null | undefined) {
  return product === "CORE_AI" || product === "CHAT_AI";
}

export function whatsappMessageContent(payload: { text?: unknown; options?: unknown; document?: unknown }) {
  const text = String(payload.text ?? "");
  if (payload.document && typeof payload.document === "object" && "link" in payload.document && typeof payload.document.link === "string") {
    return { type: "document", document: { link: payload.document.link, filename: "catalogo-produtos.pdf", caption: text.slice(0, 1024) } };
  }
  if (Array.isArray(payload.options) && payload.options.length > 0) {
    const options = payload.options as NavigationOption[];
    return { type: "interactive", interactive: {
      type: "list", body: { text: text.slice(0, 1024) }, action: { button: "Ver opções", sections: [{ rows: options.slice(0, 10).map(option => ({ id: option.id, title: option.title.slice(0, 24), description: option.title.length > 24 ? option.title.slice(0, 72) : undefined })) }] },
    } };
  }
  return { type: "text", text: { preview_url: false, body: text.slice(0, 4096) } };
}

export function incomingWhatsAppText(message: { text?: { body?: string }; interactive?: { list_reply?: { id?: string }; button_reply?: { id?: string } } }) {
  return message.text?.body ?? message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? "";
}

export function incomingWhatsAppDisplayText(message: { text?: { body?: string }; interactive?: { list_reply?: { title?: string }; button_reply?: { title?: string } } }) {
  return message.text?.body ?? message.interactive?.list_reply?.title ?? message.interactive?.button_reply?.title ?? "";
}
