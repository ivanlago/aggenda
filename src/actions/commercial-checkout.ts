"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { commercialOrders, pilotInvitations, commercialContracts, organizationSubscriptions, professionals, legalAcceptances } from "@/db/schema";
import { count } from "drizzle-orm";
import { requireOrganizationMembership, requirePlatformMember } from "@/lib/session";
import { commercialQuote, pilotQuote, extraQuote } from "@/lib/commercial-catalog";
import { asaasCheckoutLink, asaasRequest } from "@/lib/asaas";

export async function createPilotInvitation(data: FormData) {
  const { session } = await requirePlatformMember(["super_admin", "billing"]);
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe o e-mail do proprietário da clínica.");
  const token = randomBytes(32).toString("hex");
  await db.insert(pilotInvitations).values({ tokenHash: createHash("sha256").update(token).digest("hex"), email,
    createdBy: session.user.id, expiresAt: new Date(Date.now() + 14 * 86400000) });
  // Token is only shown once to the authorized platform administrator, not emailed automatically.
  redirect(`/plataforma/convites-piloto?convite=${token}`);
}

export async function revokePilotInvitation(data: FormData) {
  await requirePlatformMember(["super_admin", "billing"]);
  await db.update(pilotInvitations).set({ revokedAt: new Date() }).where(and(eq(pilotInvitations.id, String(data.get("id"))), isNull(pilotInvitations.redeemedAt)));
  revalidatePath("/plataforma/convites-piloto");
}

export async function acceptPilotInvitation(data: FormData) {
  const token = String(data.get("token") ?? "");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Convite inválido.");
  const [invite] = await db.select().from(pilotInvitations).where(and(eq(pilotInvitations.tokenHash, createHash("sha256").update(token).digest("hex")), isNull(pilotInvitations.revokedAt), isNull(pilotInvitations.redeemedAt), gt(pilotInvitations.expiresAt, new Date())));
  if (!invite) throw new Error("Convite expirado, utilizado ou revogado.");
  (await cookies()).set("aggenda_pilot", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 14 * 86400 });
  redirect(`/entrar?callbackURL=${encodeURIComponent("/onboarding?next=/assinatura?piloto=1")}`);
}

export async function startCommercialCheckout(data: FormData): Promise<{ error?: string } | undefined> {
  try { await executeCommercialCheckout(data); } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Não foi possível iniciar o pagamento." };
  }
}

async function executeCommercialCheckout(data: FormData) {
  const { session, organization } = await requireOrganizationMembership();
  if (organization.role !== "owner") throw new Error("Somente o proprietário pode contratar.");
  if (data.get("acceptTerms") !== "on") throw new Error("Aceite as condições antes de continuar.");
  const pilot = data.get("pilot") === "1";
  const extra = data.get("extra");
  const quote = extra === "responses" || extra === "documents" ? extraQuote(extra) : pilot ? pilotQuote() : commercialQuote({ product: String(data.get("product")) as "essential",
    cycle: String(data.get("cycle")) as "monthly", professionals: Number(data.get("professionals")), signatures: data.get("signatures") === "on", nfse: "none" });
  // Production NFS-e remains disabled pending fiscal homologation; cannot sell an unavailable module.
  const method = data.get("paymentMethod") === "pix" ? "PIX" : data.get("paymentMethod") === "credit_card" ? "CREDIT_CARD" : null;
  if (!method) throw new Error("Selecione Pix ou cartão.");
  const required = (key: string) => { const value = String(data.get(key) ?? "").trim(); if (!value) throw new Error(`Preencha ${key}.`); return value; };
  const cpfCnpj = required("cpfCnpj").replace(/\D/g, "");
  const postalCode = required("postalCode").replace(/\D/g, "");
  let phone = required("phoneNumber").replace(/\D/g, "");
  if (phone.startsWith("55") && phone.length > 11) phone = phone.slice(2);
  if (![11, 14].includes(cpfCnpj.length) || postalCode.length !== 8 || ![10, 11].includes(phone.length)) throw new Error("Confira documento, telefone e CEP.");
  const customerData = { name: session.user.name, email: session.user.email, cpfCnpj, phone, postalCode,
    address: required("address"), addressNumber: required("addressNumber"), province: required("province") };
  const token = pilot ? (await cookies()).get("aggenda_pilot")?.value : null;
  const requestHeaders = await headers();
  const order = await db.transaction(async (tx) => {
    const [existingSubscription] = await tx.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.organizationId, organization.id)).for("update");
    if (quote.kind !== "extra" && existingSubscription?.billingSubscriptionId && !existingSubscription.cancelAtPeriodEnd) throw new Error("Cancele a renovação da assinatura atual antes de iniciar outra contratação. O período já pago será preservado.");
    if (quote.kind !== "extra") {
      const [activeProfessionals] = await tx.select({ total: count() }).from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true)));
      if (activeProfessionals.total > quote.professionals) throw new Error("Escolha um pacote que comporte os profissionais ativos ou desative as agendas excedentes antes de contratar.");
    }
    const [contract] = await tx.select().from(commercialContracts).where(eq(commercialContracts.organizationId, organization.id)).for("update");
    if (quote.kind === "extra") {
      if (!contract || contract.endsAt <= new Date() || (quote.extraMetric === "responses" ? !contract.responseLimit : !contract.documentLimit)) throw new Error("Este pacote requer uma franquia ativa do recurso.");
    } else if (contract && contract.kind !== "trial" && contract.endsAt > new Date()) throw new Error("Já existe uma contratação ativa. Alterações de contrato precisam de atendimento da equipe.");
    if (quote.kind === "commercial") {
      const [pending] = await tx.select().from(commercialOrders).where(and(eq(commercialOrders.organizationId, organization.id), eq(commercialOrders.status, "pending")));
      if (pending && pending.createdAt.getTime() + 86400000 > Date.now()) {
        if (JSON.stringify(pending.quote) === JSON.stringify(quote) && pending.checkoutId) return pending;
        throw new Error("Há uma contratação aguardando pagamento. Conclua ou aguarde a expiração do checkout antes de iniciar outra.");
      }
    }
    let invitationId: string | undefined;
    if (pilot) {
      if (!token) throw new Error("Abra seu convite para acessar o piloto.");
      const [invite] = await tx.select().from(pilotInvitations).where(eq(pilotInvitations.tokenHash, createHash("sha256").update(token).digest("hex"))).for("update");
      if (!invite || invite.revokedAt || invite.redeemedAt || invite.expiresAt <= new Date() || invite.email !== session.user.email.toLowerCase()
        || (invite.organizationId && invite.organizationId !== organization.id)) throw new Error("Convite indisponível ou vinculado a outro e-mail/empresa.");
      invitationId = invite.id;
      await tx.update(pilotInvitations).set({ organizationId: organization.id }).where(eq(pilotInvitations.id, invite.id));
      const [pending] = await tx.select().from(commercialOrders).where(and(eq(commercialOrders.invitationId, invite.id), eq(commercialOrders.status, "pending")));
      if (pending?.checkoutId) return pending;
      if (pending) throw new Error("Um checkout está sendo preparado. Aguarde e tente novamente.");
    }
    const [created] = await tx.insert(commercialOrders).values({ organizationId: organization.id, invitationId, quote }).returning();
    await tx.insert(legalAcceptances).values(["terms", "privacy"].map((document) => ({
      organizationId: organization.id, userId: session.user.id, document, version: "2026-10-22",
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: requestHeaders.get("user-agent"),
    }))).onConflictDoNothing();
    return created;
  });
  if (order.checkoutId) redirect(asaasCheckoutLink({ id: order.checkoutId }));
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.aggenda.app.br").replace(/\/$/, "");
  const recurring = quote.kind === "commercial" && quote.cycle === "monthly" && method === "CREDIT_CARD";
  let checkout: { id: string; link?: string };
  try {
    checkout = await asaasRequest("/checkouts", { method: "POST", body: {
      billingTypes: [method], chargeTypes: [recurring ? "RECURRENT" : "DETACHED"], minutesToExpire: 1440,
      externalReference: `commercial:${order.id}`, customerData,
      callback: { successUrl: `${base}/assinatura?checkout=sucesso`, cancelUrl: `${base}/assinatura?checkout=cancelado`, expiredUrl: `${base}/assinatura?checkout=expirado` },
      items: [{ externalReference: order.id, name: `Aggenda ${quote.name}`, description: quote.kind === "extra"
        ? "Pacote avulso, válido até o fim da franquia atual. Sem renovação automática. Saldo não acumula."
        : pilot
        ? "Piloto: pagamento único por 1 ano; 1.000 respostas, 30 documentos enviados e 10 NFS-e nacionais por mês. Sem renovação automática. Integrações dependem de habilitação."
        : `${quote.months} mês(es), até ${quote.professionals} profissional(is). Franquias renovam mensalmente e não acumulam.`, quantity: 1, value: quote.amountInCents / 100 }],
      subscription: recurring ? { cycle: "MONTHLY", nextDueDate: new Date().toISOString().slice(0, 19).replace("T", " ") } : undefined,
    } });
  } catch (error) {
    await db.update(commercialOrders).set({ status: "failed" }).where(eq(commercialOrders.id, order.id));
    console.error("[commercial-checkout] Provider rejected checkout", { orderId: order.id, error: error instanceof Error ? error.message : "unknown" });
    redirect("/assinatura?checkout=erro&message=Não%20foi%20possível%20criar%20o%20pagamento.%20Tente%20novamente.");
  }
  await db.update(commercialOrders).set({ checkoutId: checkout.id }).where(eq(commercialOrders.id, order.id));
  redirect(asaasCheckoutLink(checkout));
}
