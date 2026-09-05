import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { appointments, auditLogs, chatConversations, chatMessages, clients, organizations, organizationUsageCounters, outboxEvents, professionals, services, servicesToProfessionals } from "@/db/schema";
import { generateAiJson } from "@/lib/ai/provider";
import { getAvailableTimes, isTimeAvailable } from "@/lib/availability";
import { formatOrganizationDateTime, organizationDate, withAppointmentLock } from "@/lib/appointment-safety";
import { syncAppointmentFinancialEntry } from "@/lib/finance";
import { deleteAppointmentFromGoogleCalendar, syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";
import { reconcilePackageUsage } from "@/lib/package-balance";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";
import { isAffirmativeWhatsAppCommand, isNegativeWhatsAppCommand } from "@/lib/whatsapp-command";

export const runtime = "nodejs";

const inputSchema = z.object({
  organizationId: z.string().uuid(), conversationId: z.string().uuid(), messageId: z.string().uuid(),
  phoneNumberId: z.string().min(1), from: z.string().min(5), contactName: z.string().optional(),
  text: z.string().max(4000).default(""), whatsappServiceCode: z.enum(["menu", "chat", "chat_ai", "core_ai"]),
});
const coreAnswerSchema = z.object({
  action: z.enum(["reply", "availability", "prepare_booking", "confirm_appointment", "prepare_reschedule", "prepare_cancel", "handoff"]),
  reply: z.string().min(1).max(3000), intent: z.string().max(80).default("unknown"), confidence: z.number().min(0).max(1).default(0),
  serviceId: z.string().uuid().nullable().default(null), professionalId: z.string().uuid().nullable().default(null), appointmentId: z.string().uuid().nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null), time: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null), cancellationReason: z.string().max(500).nullable().default(null),
});
const chatAnswerSchema = z.object({ action: z.enum(["reply", "handoff"]), reply: z.string().min(1).max(3500), intent: z.string().max(80), confidence: z.number().min(0).max(1) });
type Input = z.infer<typeof inputSchema>;
type Conversation = typeof chatConversations.$inferSelect;
type Pending = { kind: "book"; serviceId: string; professionalId: string; startsAt: string } | { kind: "reschedule"; appointmentId: string; startsAt: string } | { kind: "cancel"; appointmentId: string; reason: string };

function authorized(request: NextRequest) { const key = process.env.AGGENDA_INTERNAL_API_KEY; return Boolean(key && request.headers.get("authorization") === `Bearer ${key}`); }
function localTime(date: Date, timezone: string) { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(date); }
function normalizedText(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function mentionedByName<T extends { name: string }>(rows: T[], texts: string[]) {
  return texts.flatMap((text) => {
    const normalized = normalizedText(text);
    return rows.filter((row) => normalized.includes(normalizedText(row.name)));
  })[0];
}
function parseBrazilianDate(value: string) {
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
function parseBrazilianTime(value: string) {
  const match = value.match(/\b([01]?\d|2[0-3])(?::|h)([0-5]\d)?\b/i);
  return match ? `${match[1].padStart(2, "0")}:${match[2] ?? "00"}` : null;
}
function asksForUpcomingAppointments(value: string) {
  const normalized = normalizedText(value);
  return /(meus?|quais|listar|consultar|ver).*(agendamentos?|horarios?|consultas?)/.test(normalized)
    || /(agendamentos?|horarios?|consultas?).*(marcados?|proximos?|futuros?)/.test(normalized);
}
function asksToReschedule(value: string) {
  return /\b(reagend|remarc|alterar? (?:a )?(?:data|hora|horario))/.test(normalizedText(value));
}
function asksToCancel(value: string) {
  return /\b(cancel|desmarc)/.test(normalizedText(value));
}
function asksToBook(value: string) {
  return /\b(agend|marcar|reserv)/.test(normalizedText(value));
}
function parsePending(payload?: Record<string, unknown> | null): Pending | null {
  const result = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("book"), serviceId: z.string().uuid(), professionalId: z.string().uuid(), startsAt: z.string().datetime() }),
    z.object({ kind: z.literal("reschedule"), appointmentId: z.string().uuid(), startsAt: z.string().datetime() }),
    z.object({ kind: z.literal("cancel"), appointmentId: z.string().uuid(), reason: z.string().min(1) }),
  ]).safeParse(payload?.pendingAction);
  return result.success ? result.data : null;
}

async function getClient(input: Input, conversation: Conversation) {
  if (conversation.clientId) return conversation.clientId;
  const all = input.from.replace(/\D/g, ""); const phone = all.startsWith("55") && all.length > 11 ? all.slice(2) : all;
  const [found] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.organizationId, input.organizationId), sql`right(regexp_replace(coalesce(${clients.phone}, ''), '\D', '', 'g'), 10) = right(${phone}, 10)`)).limit(1);
  let id = found?.id;
  if (!id) {
    const [created] = await db.insert(clients).values({ organizationId: input.organizationId, name: input.contactName?.trim() || conversation.contactName || `WhatsApp ${phone.slice(-4)}`, phone })
      .onConflictDoUpdate({ target: [clients.organizationId, clients.phone], set: { updatedAt: new Date() } }).returning({ id: clients.id });
    id = created.id;
  }
  await db.update(chatConversations).set({ clientId: id, updatedAt: new Date() }).where(eq(chatConversations.id, conversation.id));
  return id;
}

async function send(input: Input, conversation: Conversation, data: { reply: string; model: string; intent: string; confidence: number; pending?: Pending; handoff?: boolean; ai?: boolean }) {
  const now = new Date(); let inserted = false;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.conversationId}))`);
    const [recentDuplicate] = await tx.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.conversationId, input.conversationId), eq(chatMessages.direction, "outbound"), eq(chatMessages.body, data.reply), gte(chatMessages.occurredAt, new Date(now.getTime() - 120_000)))).limit(1);
    if (recentDuplicate) return;
    const [message] = await tx.insert(chatMessages).values({ organizationId: input.organizationId, conversationId: input.conversationId, externalMessageId: `aggenda-ai:${input.messageId}`, direction: "outbound", status: "queued", messageType: "text", body: data.reply, rawPayload: { source: "aggenda_ai", model: data.model, intent: data.intent, confidence: data.confidence, ...(data.pending ? { pendingAction: data.pending } : {}) }, occurredAt: now })
      .onConflictDoNothing({ target: chatMessages.externalMessageId }).returning({ id: chatMessages.id });
    if (!message) return; inserted = true;
    await tx.insert(outboxEvents).values({ organizationId: input.organizationId, eventKey: `whatsapp:ai-reply:${input.messageId}`, eventType: "whatsapp.message.send", aggregateType: "chat_message", aggregateId: message.id, payload: { organizationId: input.organizationId, channelId: conversation.channelId, conversationId: input.conversationId, messageId: message.id, phoneNumberId: input.phoneNumberId, to: input.from, text: data.reply } }).onConflictDoNothing({ target: outboxEvents.eventKey });
    await tx.update(chatConversations).set({ handoffStatus: data.handoff ? "requested" : conversation.handoffStatus, handoffReason: data.handoff ? `IA: ${data.intent}` : conversation.handoffReason, automationPaused: Boolean(data.handoff), handoffRequestedAt: data.handoff ? now : conversation.handoffRequestedAt, updatedAt: now }).where(eq(chatConversations.id, input.conversationId));
    if (data.ai) { const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`; await tx.insert(organizationUsageCounters).values({ organizationId: input.organizationId, periodStart, metric: "ai.calls", quantity: 1 }).onConflictDoUpdate({ target: [organizationUsageCounters.organizationId, organizationUsageCounters.periodStart, organizationUsageCounters.metric], set: { quantity: sql`${organizationUsageCounters.quantity} + 1`, updatedAt: now } }); }
  });
  if (inserted) await triggerOutboxWorker();
}

async function upcoming(organizationId: string, clientId: string) {
  return db.select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, serviceId: appointments.serviceId, serviceName: services.name, professionalId: appointments.professionalId, professionalName: professionals.name })
    .from(appointments).innerJoin(services, eq(services.id, appointments.serviceId)).leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(eq(appointments.organizationId, organizationId), eq(appointments.clientId, clientId), inArray(appointments.status, ["scheduled", "confirmed"]), gte(appointments.startsAt, new Date()))).orderBy(asc(appointments.startsAt)).limit(10);
}

async function execute(input: Input, pending: Pending, clientId: string, timezone: string) {
  if (pending.kind === "book") {
    const startsAt = new Date(pending.startsAt);
    const [[service], [professional]] = await Promise.all([
      db.select({ name: services.name, duration: services.durationMinutes, price: services.priceInCents }).from(services).where(and(eq(services.id, pending.serviceId), eq(services.organizationId, input.organizationId), eq(services.isActive, true))).limit(1),
      db.select({ name: professionals.name }).from(professionals).where(and(eq(professionals.id, pending.professionalId), eq(professionals.organizationId, input.organizationId), eq(professionals.isActive, true), eq(professionals.isBookable, true))).limit(1),
    ]);
    if (!service || !professional) throw new Error("O serviço ou profissional não está mais disponível.");
    const item = await withAppointmentLock(input.organizationId, pending.professionalId, async (tx) => {
      const [repeat] = await tx.select().from(appointments).where(and(eq(appointments.organizationId, input.organizationId), sql`${appointments.metadata}->>'whatsappCommandMessageId' = ${input.messageId}`)).limit(1); if (repeat) return repeat;
      if (!await isTimeAvailable({ organizationId: input.organizationId, timezone, date: organizationDate(startsAt, timezone), serviceId: pending.serviceId, professionalId: pending.professionalId, startsAt })) throw new Error("Esse horário acabou de ficar indisponível. Escolha outro horário.");
      const [created] = await tx.insert(appointments).values({ organizationId: input.organizationId, clientId, serviceId: pending.serviceId, professionalId: pending.professionalId, startsAt, endsAt: new Date(startsAt.getTime() + service.duration * 60000), priceInCents: service.price, source: "whatsapp", metadata: { whatsappCommandMessageId: input.messageId, conversationId: input.conversationId } }).returning();
      await tx.insert(auditLogs).values({ organizationId: input.organizationId, action: "create", entityType: "appointment", entityId: created.id, details: { clientId, source: "whatsapp", startsAt: startsAt.toISOString(), status: "scheduled", messageId: input.messageId } }); return created;
    });
    await Promise.allSettled([syncAppointmentFinancialEntry(item.id), syncAppointmentToGoogleCalendar(item.id)]);
    return `Agendamento confirmado: ${service.name} com ${professional.name}, em ${formatOrganizationDateTime(item.startsAt, timezone)}.`;
  }
  const [current] = await db.select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, metadata: appointments.metadata, serviceId: appointments.serviceId, serviceName: services.name, professionalId: appointments.professionalId, professionalName: professionals.name })
    .from(appointments).innerJoin(services, eq(services.id, appointments.serviceId)).leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(eq(appointments.id, pending.appointmentId), eq(appointments.organizationId, input.organizationId), eq(appointments.clientId, clientId))).limit(1);
  if (!current) throw new Error("Não encontrei esse agendamento.");
  if (current.metadata?.whatsappCommandMessageId === input.messageId) return pending.kind === "cancel" ? `Seu agendamento de ${current.serviceName} já está cancelado.` : `Seu agendamento já foi reagendado para ${formatOrganizationDateTime(current.startsAt, timezone)}.`;
  if (pending.kind === "cancel") {
    await db.transaction(async (tx) => { await tx.update(appointments).set({ status: "cancelled", cancellationReason: pending.reason, metadata: { ...(current.metadata ?? {}), whatsappCommandMessageId: input.messageId, conversationId: input.conversationId }, updatedAt: new Date() }).where(eq(appointments.id, current.id)); await tx.insert(auditLogs).values({ organizationId: input.organizationId, action: "status:cancelled", entityType: "appointment", entityId: current.id, details: { previousStatus: current.status, status: "cancelled", cancellationReason: pending.reason, source: "whatsapp", messageId: input.messageId } }); });
    await Promise.allSettled([deleteAppointmentFromGoogleCalendar(current.id), reconcilePackageUsage(current.id, "cancelled"), syncAppointmentFinancialEntry(current.id)]); return `Seu agendamento de ${current.serviceName}, previsto para ${formatOrganizationDateTime(current.startsAt, timezone)}, foi cancelado.`;
  }
  if (!current.professionalId) throw new Error("Esse agendamento não possui profissional definido.");
  const startsAt = new Date(pending.startsAt); const [service] = await db.select({ duration: services.durationMinutes }).from(services).where(eq(services.id, current.serviceId)).limit(1);
  const updated = await withAppointmentLock(input.organizationId, current.professionalId, async (tx) => {
    if (!await isTimeAvailable({ organizationId: input.organizationId, timezone, date: organizationDate(startsAt, timezone), serviceId: current.serviceId, professionalId: current.professionalId, excludeAppointmentId: current.id, startsAt })) throw new Error("Esse horário acabou de ficar indisponível. Escolha outro horário.");
    const [row] = await tx.update(appointments).set({ startsAt, endsAt: new Date(startsAt.getTime() + service.duration * 60000), status: "scheduled", reminderClaimedAt: null, reminderSentAt: null, metadata: { ...(current.metadata ?? {}), whatsappCommandMessageId: input.messageId, conversationId: input.conversationId }, updatedAt: new Date() }).where(eq(appointments.id, current.id)).returning();
    await tx.insert(auditLogs).values({ organizationId: input.organizationId, action: "reschedule", entityType: "appointment", entityId: current.id, details: { from: current.startsAt.toISOString(), to: startsAt.toISOString(), source: "whatsapp", messageId: input.messageId } }); return row;
  });
  await Promise.allSettled([syncAppointmentToGoogleCalendar(updated.id), syncAppointmentFinancialEntry(updated.id)]); return `Seu agendamento de ${current.serviceName} foi reagendado para ${formatOrganizationDateTime(updated.startsAt, timezone)}.`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 }); const input = parsed.data;
  if ((await db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.externalMessageId, `aggenda-ai:${input.messageId}`)).limit(1))[0]) return NextResponse.json({ accepted: true, duplicate: true });
  const [loadedConversation] = await db.select().from(chatConversations).where(and(eq(chatConversations.id, input.conversationId), eq(chatConversations.organizationId, input.organizationId))).limit(1);
  if (!loadedConversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  const legacySchedulingPause = input.whatsappServiceCode === "core_ai" && loadedConversation.handoffStatus === "requested" && /^IA: (schedule|appointment)/i.test(loadedConversation.handoffReason ?? "");
  const conversation = legacySchedulingPause ? { ...loadedConversation, handoffStatus: "bot", handoffReason: null, automationPaused: false, handoffResolvedAt: new Date() } : loadedConversation;
  if (legacySchedulingPause) {
    await db.update(chatConversations).set({ handoffStatus: "bot", handoffReason: null, automationPaused: false, handoffResolvedAt: conversation.handoffResolvedAt, updatedAt: new Date() }).where(eq(chatConversations.id, input.conversationId));
    console.info("[whatsapp-agent] pausa legada de agendamento removida", { conversationId: input.conversationId });
  }
  if (conversation.automationPaused || conversation.handoffStatus === "human") {
    console.info("[whatsapp-agent] conversa sob atendimento humano", { conversationId: input.conversationId, handoffStatus: conversation.handoffStatus });
    return NextResponse.json({ accepted: true, skipped: "human_handoff" });
  }
  const [organization] = await db.select({ name: organizations.name, description: organizations.publicDescription, timezone: organizations.timezone, slotIntervalMinutes: organizations.slotIntervalMinutes }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
  if (!organization) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  const normalizedMessage = input.text.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[!.?,;:]+$/g, "").trim();
  if (/^(oi|ola|bom dia|boa tarde|boa noite|hey|hello)$/.test(normalizedMessage)) {
    await send(input, conversation, {
      reply: `Olá! Você está falando com ${organization.name}. Posso ajudar a consultar horários, agendar, confirmar, reagendar ou cancelar um atendimento. O que deseja fazer?`,
      model: "aggenda-transactional-v1",
      intent: "greeting",
      confidence: 1,
    });
    return NextResponse.json({ accepted: true, action: "reply" });
  }
  const [latest] = await db.select({ rawPayload: chatMessages.rawPayload }).from(chatMessages).where(and(eq(chatMessages.conversationId, input.conversationId), eq(chatMessages.direction, "outbound"))).orderBy(desc(chatMessages.occurredAt)).limit(1);
  const pending = parsePending(latest?.rawPayload); const clientId = await getClient(input, conversation);
  if (pending && (isAffirmativeWhatsAppCommand(input.text) || isNegativeWhatsAppCommand(input.text))) {
    if (isNegativeWhatsAppCommand(input.text)) { await send(input, conversation, { reply: "Tudo bem. A operação não foi realizada. Como mais posso ajudar?", model: "aggenda-transactional-v1", intent: "operation_declined", confidence: 1 }); return NextResponse.json({ accepted: true, action: "declined" }); }
    try { const reply = await execute(input, pending, clientId, organization.timezone); await send(input, conversation, { reply, model: "aggenda-transactional-v1", intent: pending.kind, confidence: 1 }); return NextResponse.json({ accepted: true, action: pending.kind }); }
    catch (error) { const reply = error instanceof Error ? error.message : "Não foi possível concluir a operação."; await send(input, conversation, { reply, model: "aggenda-transactional-v1", intent: `${pending.kind}_failed`, confidence: 1 }); return NextResponse.json({ accepted: true, action: `${pending.kind}_failed` }); }
  }
  const [catalog, professionalRows, future, history] = await Promise.all([
    db.select({ id: services.id, name: services.name, description: services.description, durationMinutes: services.durationMinutes, priceInCents: services.priceInCents }).from(services).where(and(eq(services.organizationId, input.organizationId), eq(services.isActive, true))).limit(50),
    db.select({ id: professionals.id, name: professionals.name, serviceId: servicesToProfessionals.serviceId }).from(professionals).leftJoin(servicesToProfessionals, and(eq(servicesToProfessionals.professionalId, professionals.id), eq(servicesToProfessionals.organizationId, input.organizationId))).where(and(eq(professionals.organizationId, input.organizationId), eq(professionals.isActive, true), eq(professionals.isBookable, true))),
    upcoming(input.organizationId, clientId), db.select({ direction: chatMessages.direction, body: chatMessages.body }).from(chatMessages).where(eq(chatMessages.conversationId, input.conversationId)).orderBy(desc(chatMessages.occurredAt)).limit(12),
  ]);
  const ai = input.whatsappServiceCode === "chat_ai" || input.whatsappServiceCode === "core_ai";
  if (input.whatsappServiceCode !== "core_ai") {
    const result = ai ? await generateAiJson({ schema: chatAnswerSchema, messages: [{ role: "system", content: "Atenda em português usando somente o contexto. Não execute operações; transfira ações operacionais ou casos ambíguos para humano. Responda JSON com action, reply, intent e confidence." }, { role: "user", content: JSON.stringify({ organization, catalog, recentMessages: history.reverse(), currentMessage: input.text }) }] }) : { data: { action: "reply" as const, reply: `Olá! Você está falando com ${organization.name}. Como podemos ajudar?`, intent: "greeting", confidence: 1 }, model: "aggenda-deterministic-v1" };
    await send(input, conversation, { reply: result.data.reply, model: result.model, intent: result.data.intent, confidence: result.data.confidence, handoff: result.data.action === "handoff", ai }); return NextResponse.json({ accepted: true, action: result.data.action });
  }
  if (asksForUpcomingAppointments(input.text)) {
    const reply = future.length
      ? `Seus próximos agendamentos:\n${future.map((appointment) => `• ${appointment.serviceName} com ${appointment.professionalName ?? "profissional a definir"}, em ${formatOrganizationDateTime(appointment.startsAt, organization.timezone)} (${appointment.status === "confirmed" ? "confirmado" : "agendado"})`).join("\n")}`
      : "Você não possui agendamentos futuros ativos.";
    await send(input, conversation, { reply, model: "aggenda-transactional-v1", intent: "list_appointments", confidence: 1 });
    return NextResponse.json({ accepted: true, action: "reply" });
  }
  const contextTexts = [input.text, ...history.map((message) => message.body ?? "")];
  const directlyMentionedProfessional = mentionedByName(professionalRows, [input.text]);
  const contextualService = mentionedByName(catalog, contextTexts);
  const contextualProfessional = mentionedByName(professionalRows, contextTexts);
  const directDate = parseBrazilianDate(input.text);
  const contextualDate = contextTexts.map(parseBrazilianDate).find(Boolean) ?? null;
  const directTime = parseBrazilianTime(input.text);
  if (asksToBook(input.text) && !contextualService) {
    const options = catalog.slice(0, 10).map((service) => `• ${service.name}`).join("\n");
    const suffix = catalog.length > 10 ? "\nSe preferir, escreva o nome do atendimento desejado." : "";
    await send(input, conversation, {
      reply: catalog.length
        ? `Qual atendimento você deseja agendar?\n${options}${suffix}`
        : "No momento não há atendimentos disponíveis para agendamento. Posso ajudar com outra informação?",
      model: "aggenda-transactional-v1",
      intent: "select_service",
      confidence: 1,
    });
    return NextResponse.json({ accepted: true, action: "reply" });
  }
  if (directlyMentionedProfessional && contextualService) {
    const professionalPerformsService = professionalRows.some((row) => row.id === directlyMentionedProfessional.id && row.serviceId === contextualService.id);
    const reply = professionalPerformsService
      ? `Para qual data você deseja agendar ${contextualService.name} com ${directlyMentionedProfessional.name}?`
      : `${directlyMentionedProfessional.name} não realiza ${contextualService.name}. Deseja consultar outro profissional?`;
    await send(input, conversation, { reply, model: "aggenda-transactional-v1", intent: "select_professional", confidence: 1 });
    return NextResponse.json({ accepted: true, action: "reply" });
  }
  if (asksToReschedule(input.text)) {
    const matchingAppointments = contextualService ? future.filter((item) => item.serviceId === contextualService.id) : [];
    const appointment = future.length === 1 ? future[0] : matchingAppointments.length === 1 ? matchingAppointments[0] : undefined;
    if (!appointment) {
      const reply = future.length ? "Qual dos seus agendamentos você deseja reagendar?" : "Você não possui agendamentos futuros ativos.";
      await send(input, conversation, { reply, model: "aggenda-transactional-v1", intent: "prepare_reschedule", confidence: 1 });
      return NextResponse.json({ accepted: true, action: "reply" });
    }
    if (!directDate || !directTime || !appointment.professionalId) {
      await send(input, conversation, { reply: "Para qual data e horário deseja reagendar?", model: "aggenda-transactional-v1", intent: "prepare_reschedule", confidence: 1 });
      return NextResponse.json({ accepted: true, action: "reply" });
    }
    const slots = await getAvailableTimes({ organizationId: input.organizationId, timezone: organization.timezone, date: directDate, serviceId: appointment.serviceId, professionalId: appointment.professionalId, slotIntervalMinutes: organization.slotIntervalMinutes, excludeAppointmentId: appointment.id });
    const selected = slots?.find((slot) => localTime(new Date(slot), organization.timezone) === directTime);
    if (!selected) {
      await send(input, conversation, { reply: "Esse horário não está disponível. Escolha outro horário.", model: "aggenda-transactional-v1", intent: "prepare_reschedule", confidence: 1 });
      return NextResponse.json({ accepted: true, action: "reply" });
    }
    const nextPending: Pending = { kind: "reschedule", appointmentId: appointment.id, startsAt: selected };
    await send(input, conversation, { reply: `Confirma reagendar ${appointment.serviceName} de ${formatOrganizationDateTime(appointment.startsAt, organization.timezone)} para ${formatOrganizationDateTime(new Date(selected), organization.timezone)}? Responda CONFIRMAR.`, model: "aggenda-transactional-v1", intent: "prepare_reschedule", confidence: 1, pending: nextPending });
    return NextResponse.json({ accepted: true, action: "prepare_reschedule" });
  }
  if (asksToCancel(input.text)) {
    const matchingAppointments = contextualService ? future.filter((item) => item.serviceId === contextualService.id) : [];
    const appointment = future.length === 1 ? future[0] : matchingAppointments.length === 1 ? matchingAppointments[0] : undefined;
    if (!appointment) {
      const reply = future.length ? "Qual dos seus agendamentos você deseja cancelar?" : "Você não possui agendamentos futuros ativos.";
      await send(input, conversation, { reply, model: "aggenda-transactional-v1", intent: "prepare_cancel", confidence: 1 });
      return NextResponse.json({ accepted: true, action: "reply" });
    }
    const nextPending: Pending = { kind: "cancel", appointmentId: appointment.id, reason: "Cancelado pelo cliente via WhatsApp" };
    await send(input, conversation, { reply: `Confirma cancelar ${appointment.serviceName}, marcado para ${formatOrganizationDateTime(appointment.startsAt, organization.timezone)}? Responda CONFIRMAR.`, model: "aggenda-transactional-v1", intent: "prepare_cancel", confidence: 1, pending: nextPending });
    return NextResponse.json({ accepted: true, action: "prepare_cancel" });
  }
  if (contextualService && contextualProfessional && (directDate || (directTime && contextualDate))) {
    const date = directDate ?? contextualDate!;
    const professionalPerformsService = professionalRows.some((row) => row.id === contextualProfessional.id && row.serviceId === contextualService.id);
    if (!professionalPerformsService) {
      await send(input, conversation, { reply: `${contextualProfessional.name} não realiza ${contextualService.name}. Deseja consultar outro profissional?`, model: "aggenda-transactional-v1", intent: "invalid_professional", confidence: 1 });
      return NextResponse.json({ accepted: true, action: "reply" });
    }
    const slots = await getAvailableTimes({ organizationId: input.organizationId, timezone: organization.timezone, date, serviceId: contextualService.id, professionalId: contextualProfessional.id, slotIntervalMinutes: organization.slotIntervalMinutes });
    const selected = directTime ? slots?.find((slot) => localTime(new Date(slot), organization.timezone) === directTime) : undefined;
    if (directTime && selected) {
      const nextPending: Pending = { kind: "book", serviceId: contextualService.id, professionalId: contextualProfessional.id, startsAt: selected };
      await send(input, conversation, { reply: `Confirma ${contextualService.name} com ${contextualProfessional.name} em ${formatOrganizationDateTime(new Date(selected), organization.timezone)}? Responda CONFIRMAR.`, model: "aggenda-transactional-v1", intent: "prepare_booking", confidence: 1, pending: nextPending });
      return NextResponse.json({ accepted: true, action: "prepare_booking" });
    }
    const reply = directTime
      ? "Esse horário não está disponível. Escolha outro horário."
      : slots?.length
        ? `Horários disponíveis em ${input.text.trim()}: ${slots.slice(0, 10).map((slot) => localTime(new Date(slot), organization.timezone)).join(", ")}. Qual prefere?`
        : `Não há horários disponíveis em ${input.text.trim()}. Deseja consultar outro dia?`;
    await send(input, conversation, { reply, model: "aggenda-transactional-v1", intent: "availability", confidence: 1 });
    return NextResponse.json({ accepted: true, action: "availability" });
  }
  let result: { data: z.infer<typeof coreAnswerSchema>; model: string };
  try {
    result = await generateAiJson({ schema: coreAnswerSchema, messages: [{ role: "system", content: "Você é o agente de agendamentos do Aggenda. Nunca invente IDs ou dados. Use availability para horários, prepare_booking para agendar, prepare_reschedule para reagendar, prepare_cancel para cancelar e confirm_appointment para confirmar. A aplicação fará validações e pedirá confirmação antes de alterações. Se faltar dado, use reply e pergunte somente o próximo. Use handoff em ambiguidade relevante ou confiança abaixo de 0,65. Datas YYYY-MM-DD, horas HH:mm. Responda somente JSON." }, { role: "user", content: JSON.stringify({ today: organizationDate(new Date(), organization.timezone), timezone: organization.timezone, organization, catalog, professionals: professionalRows, upcomingAppointments: future.map(x => ({ ...x, startsAtLocal: formatOrganizationDateTime(x.startsAt, organization.timezone) })), recentMessages: history.reverse(), currentMessage: input.text }) }] });
  } catch (error) {
    console.error("[whatsapp-agent] falha ao interpretar mensagem", { conversationId: input.conversationId, messageId: input.messageId, error: error instanceof Error ? error.message : String(error) });
    await send(input, conversation, { reply: "Não consegui interpretar essa solicitação. Pode reformular em uma frase?", model: "aggenda-transactional-v1", intent: "interpretation_failed", confidence: 1 });
    return NextResponse.json({ accepted: true, action: "reply_fallback" });
  }
  const answer = result.data; let reply = answer.reply; let nextPending: Pending | undefined;
  const service = answer.serviceId ? catalog.find(x => x.id === answer.serviceId) : undefined; const professional = answer.professionalId ? professionalRows.find(x => x.id === answer.professionalId) : undefined; const appointment = answer.appointmentId ? future.find(x => x.id === answer.appointmentId) : future.length === 1 ? future[0] : undefined;
  if (answer.action === "availability" || answer.action === "prepare_booking") {
    if (!service || !professional || !answer.date) reply = !service ? `Qual serviço você deseja? ${catalog.map(x => x.name).join(", ")}` : !professional ? `Com qual profissional? ${professionalRows.map(x => x.name).join(", ")}` : "Para qual data deseja consultar?";
    else { const slots = await getAvailableTimes({ organizationId: input.organizationId, timezone: organization.timezone, date: answer.date, serviceId: service.id, professionalId: professional.id, slotIntervalMinutes: organization.slotIntervalMinutes }); const selected = answer.time ? slots?.find(x => localTime(new Date(x), organization.timezone) === answer.time) : undefined;
      if (answer.action === "prepare_booking" && selected) { nextPending = { kind: "book", serviceId: service.id, professionalId: professional.id, startsAt: selected }; reply = `Confirma ${service.name} com ${professional.name} em ${formatOrganizationDateTime(new Date(selected), organization.timezone)}? Responda CONFIRMAR.`; }
      else reply = slots?.length ? `Horários disponíveis: ${slots.slice(0, 10).map(x => localTime(new Date(x), organization.timezone)).join(", ")}. Qual prefere?` : "Não há horários disponíveis nessa data. Deseja outro dia?";
    }
  } else if (answer.action === "prepare_reschedule") {
    if (!appointment) reply = future.length ? "Qual agendamento deseja alterar?" : "Não encontrei agendamentos futuros.";
    else if (!answer.date || !answer.time || !appointment.professionalId) reply = "Para qual data e horário deseja reagendar?";
    else { const slots = await getAvailableTimes({ organizationId: input.organizationId, timezone: organization.timezone, date: answer.date, serviceId: appointment.serviceId, professionalId: appointment.professionalId, slotIntervalMinutes: organization.slotIntervalMinutes, excludeAppointmentId: appointment.id }); const selected = slots?.find(x => localTime(new Date(x), organization.timezone) === answer.time); if (!selected) reply = "Esse horário não está disponível."; else { nextPending = { kind: "reschedule", appointmentId: appointment.id, startsAt: selected }; reply = `Confirma reagendar ${appointment.serviceName} de ${formatOrganizationDateTime(appointment.startsAt, organization.timezone)} para ${formatOrganizationDateTime(new Date(selected), organization.timezone)}? Responda CONFIRMAR.`; } }
  } else if (answer.action === "prepare_cancel") {
    if (!appointment) reply = future.length ? "Qual agendamento deseja cancelar?" : "Não encontrei agendamentos futuros."; else { nextPending = { kind: "cancel", appointmentId: appointment.id, reason: answer.cancellationReason || "Cancelado pelo cliente via WhatsApp" }; reply = `Confirma cancelar ${appointment.serviceName}, marcado para ${formatOrganizationDateTime(appointment.startsAt, organization.timezone)}? Responda CONFIRMAR.`; }
  } else if (answer.action === "confirm_appointment") {
    if (!appointment) reply = future.length ? "Qual agendamento deseja confirmar?" : "Não encontrei agendamentos futuros."; else { await db.transaction(async tx => { await tx.update(appointments).set({ status: "confirmed", confirmedAt: new Date(), metadata: { whatsappCommandMessageId: input.messageId, conversationId: input.conversationId }, updatedAt: new Date() }).where(eq(appointments.id, appointment.id)); await tx.insert(auditLogs).values({ organizationId: input.organizationId, action: "status:confirmed", entityType: "appointment", entityId: appointment.id, details: { previousStatus: appointment.status, status: "confirmed", source: "whatsapp", messageId: input.messageId } }); }); reply = `Agendamento de ${appointment.serviceName}, em ${formatOrganizationDateTime(appointment.startsAt, organization.timezone)}, confirmado.`; }
  }
  await send(input, conversation, { reply, model: result.model, intent: answer.intent, confidence: answer.confidence, pending: nextPending, handoff: answer.action === "handoff", ai: true }); return NextResponse.json({ accepted: true, action: answer.action });
}
