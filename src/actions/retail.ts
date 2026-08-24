"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  appointmentInventoryConsumptions,
  clients,
  financialEntries,
  inventoryMovements,
  inventoryProducts,
  outboxEvents,
  retailProductVariants,
  retailProducts,
  retailSaleItems,
  retailSalePayments,
  retailSales,
  serviceInventoryItems,
  whatsappChannels,
} from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";
import { sendRetailReceiptEmail } from "@/lib/email";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";
import { assertOrganizationPermission, hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function money(data: FormData, key: string, required = true) {
  const raw = text(data, key).replace(/\s/g, "");
  if (!raw && !required) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Informe um valor monetário válido.");
  return Math.round(parsed * 100);
}

function quantity(data: FormData, key: string) {
  const parsed = Number(text(data, key).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Informe uma quantidade válida.");
  return Math.round(parsed * 1000);
}

export async function createRetailProduct(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const name = text(data, "name");
  const variantName = text(data, "variantName") || "Padrão";
  if (name.length < 2) throw new Error("Informe o nome do produto.");
  const isForSale = data.get("isForSale") === "on";
  const isForProcedures = data.get("isForProcedures") === "on";
  if (!isForSale && !isForProcedures) throw new Error("Escolha se o produto será vendido, usado em procedimentos ou ambos.");
  const salePriceInCents = money(data, "salePrice", isForSale);
  if (isForSale && salePriceInCents <= 0) throw new Error("Informe o preço de venda do produto.");
  const initialQuantity = quantity(data, "initialQuantity");
  const minimumQuantity = quantity(data, "minimumQuantity");
  const displayName = variantName === "Padrão" ? name : `${name} — ${variantName}`;

  const productId = await db.transaction(async (tx) => {
    const [stockItem] = await tx.insert(inventoryProducts).values({
      organizationId: organization.id,
      name: displayName,
      sku: text(data, "sku") || null,
      unit: text(data, "unit") || "unit",
      currentQuantityMillis: initialQuantity,
      minimumQuantityMillis: minimumQuantity,
      costInCents: money(data, "cost", false),
    }).returning({ id: inventoryProducts.id });
    const [product] = await tx.insert(retailProducts).values({
      organizationId: organization.id,
      name,
      brand: text(data, "brand") || null,
      description: text(data, "description") || null,
    }).returning({ id: retailProducts.id });
    await tx.insert(retailProductVariants).values({
      organizationId: organization.id,
      productId: product.id,
      inventoryProductId: stockItem.id,
      name: variantName,
      barcode: text(data, "barcode") || null,
      salePriceInCents,
      commissionRateBasisPoints: Math.min(10_000, Math.round(Number(text(data, "commissionRate").replace(",", ".") || 0) * 100)),
      isForSale,
      isForProcedures,
    });
    if (initialQuantity > 0) await tx.insert(inventoryMovements).values({
      organizationId: organization.id,
      productId: stockItem.id,
      type: "initial",
      quantityMillis: initialQuantity,
      balanceAfterMillis: initialQuantity,
      notes: "Estoque inicial do produto de venda",
      createdByUserId: session.user.id,
    });
    return product.id;
  });

  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "retail_product", entityId: productId });
  revalidatePath("/produtos");
  revalidatePath("/vendas");
  revalidatePath("/estoque");
}

export async function updateRetailVariant(data: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const variantId = text(data, "variantId");
  const isForSale = data.get("isForSale") === "on";
  const isForProcedures = data.get("isForProcedures") === "on";
  if (!isForSale && !isForProcedures) throw new Error("Escolha ao menos uma finalidade para o produto.");
  const salePriceInCents = money(data, "salePrice", isForSale);
  if (isForSale && salePriceInCents <= 0) throw new Error("Informe o preço de venda do produto.");
  const name = text(data, "name");
  const variantName = text(data, "variantName") || "Padrão";
  if (name.length < 2) throw new Error("Informe o nome do produto.");
  const [variant] = await db.select({ inventoryProductId: retailProductVariants.inventoryProductId, productId: retailProductVariants.productId }).from(retailProductVariants).where(and(
    eq(retailProductVariants.id, variantId), eq(retailProductVariants.organizationId, organization.id),
  )).limit(1);
  if (!variant) throw new Error("Variação não encontrada.");
  await db.transaction(async (tx) => {
    await tx.update(retailProducts).set({
      name, brand: text(data, "brand") || null, description: text(data, "description") || null, updatedAt: new Date(),
    }).where(and(eq(retailProducts.id, variant.productId), eq(retailProducts.organizationId, organization.id)));
    await tx.update(retailProductVariants).set({
      name: variantName, salePriceInCents, barcode: text(data, "barcode") || null, isForSale, isForProcedures,
      commissionRateBasisPoints: Math.min(10_000, Math.round(Number(text(data, "commissionRate").replace(",", ".") || 0) * 100)),
      isActive: data.get("isActive") === "on", updatedAt: new Date(),
    }).where(eq(retailProductVariants.id, variantId));
    await tx.update(inventoryProducts).set({
      name: variantName === "Padrão" ? name : `${name} — ${variantName}`,
      sku: text(data, "sku") || null, unit: text(data, "unit") || "unit", costInCents: money(data, "cost", false),
      minimumQuantityMillis: quantity(data, "minimumQuantity"),
      isActive: data.get("isActive") === "on", updatedAt: new Date(),
    }).where(and(eq(inventoryProducts.id, variant.inventoryProductId), eq(inventoryProducts.organizationId, organization.id)));
    if (!isForProcedures) await tx.delete(serviceInventoryItems).where(and(
      eq(serviceInventoryItems.organizationId, organization.id),
      eq(serviceInventoryItems.productId, variant.inventoryProductId),
    ));
  });
  revalidatePath("/produtos"); revalidatePath("/vendas"); revalidatePath("/estoque");
}

export async function deleteRetailProduct(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const variantId = text(data, "variantId");
  const [variant] = await db.select({
    productId: retailProductVariants.productId,
    inventoryProductId: retailProductVariants.inventoryProductId,
    balance: inventoryProducts.currentQuantityMillis,
  }).from(retailProductVariants).innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId)).where(and(
    eq(retailProductVariants.id, variantId), eq(retailProductVariants.organizationId, organization.id),
  )).limit(1);
  if (!variant) return { error: "Produto não encontrado." };
  if (variant.balance !== 0) return { error: "Zere o saldo no Controle de estoque antes de excluir o produto." };

  const [saleReference, consumptionReference] = await Promise.all([
    db.select({ id: retailSaleItems.id }).from(retailSaleItems).where(and(
      eq(retailSaleItems.organizationId, organization.id), eq(retailSaleItems.variantId, variantId),
    )).limit(1),
    db.select({ productId: appointmentInventoryConsumptions.productId }).from(appointmentInventoryConsumptions).where(and(
      eq(appointmentInventoryConsumptions.organizationId, organization.id),
      eq(appointmentInventoryConsumptions.productId, variant.inventoryProductId),
    )).limit(1),
  ]);
  if (saleReference.length || consumptionReference.length) {
    return { error: "Este produto possui histórico de venda ou procedimento. Desative-o para preservar os registros." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(serviceInventoryItems).where(and(
      eq(serviceInventoryItems.organizationId, organization.id), eq(serviceInventoryItems.productId, variant.inventoryProductId),
    ));
    await tx.delete(inventoryMovements).where(and(
      eq(inventoryMovements.organizationId, organization.id), eq(inventoryMovements.productId, variant.inventoryProductId),
    ));
    await tx.delete(retailProductVariants).where(and(
      eq(retailProductVariants.id, variantId), eq(retailProductVariants.organizationId, organization.id),
    ));
    await tx.delete(inventoryProducts).where(and(
      eq(inventoryProducts.id, variant.inventoryProductId), eq(inventoryProducts.organizationId, organization.id),
    ));
    const remaining = await tx.select({ id: retailProductVariants.id }).from(retailProductVariants).where(eq(retailProductVariants.productId, variant.productId)).limit(1);
    if (!remaining.length) await tx.delete(retailProducts).where(and(
      eq(retailProducts.id, variant.productId), eq(retailProducts.organizationId, organization.id),
    ));
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "delete", entityType: "retail_product", entityId: variant.productId });
  revalidatePath("/produtos"); revalidatePath("/vendas"); revalidatePath("/estoque");
}

type SaleInputItem = { variantId?: unknown; quantity?: unknown; discountInCents?: unknown };
type SalePaymentInput = { method?: unknown; amountInCents?: unknown };

export async function registerRetailSale(data: FormData) {
  const { session, organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "sales.sell") && !hasOrganizationPermission(organization.role, "inventory.manage")) assertOrganizationPermission(organization.role, "sales.sell");
  let parsed: SaleInputItem[];
  try { parsed = JSON.parse(text(data, "items")); } catch { throw new Error("Itens da venda inválidos."); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 50) throw new Error("Adicione ao menos um produto à venda.");
  const grouped = new Map<string, { quantity: number; discountInCents: number }>();
  for (const item of parsed) {
    const variantId = typeof item.variantId === "string" ? item.variantId : "";
    const quantity = Number(item.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10_000) throw new Error("Revise os produtos e as quantidades da venda.");
    const discountInCents = Number(item.discountInCents ?? 0);
    if (!Number.isInteger(discountInCents) || discountInCents < 0) throw new Error("Revise os descontos dos itens.");
    const current = grouped.get(variantId) ?? { quantity: 0, discountInCents: 0 };
    grouped.set(variantId, { quantity: current.quantity + quantity, discountInCents: current.discountInCents + discountInCents });
  }
  const hasItemDiscount = [...grouped.values()].some((item) => item.discountInCents > 0);
  if (hasItemDiscount) assertOrganizationPermission(organization.role, "sales.discount");
  const variantIds = [...grouped.keys()];
  const clientId = text(data, "clientId") || null;
  const [client] = clientId ? await db.select({ id: clients.id, email: clients.email, phone: clients.phone }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1) : [];
  if (clientId && !client) throw new Error("Cliente não encontrado.");
  const receiptEmail = text(data, "receiptEmail") || client?.email || null;
  const receiptPhone = text(data, "receiptPhone") || client?.phone || null;
  if (receiptEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail)) throw new Error("Informe um e-mail válido para o recibo.");
  const receiptPhoneDigits = receiptPhone?.replace(/\D/g, "") || null;
  if (receiptPhoneDigits && receiptPhoneDigits.length < 10) throw new Error("Informe um WhatsApp válido para o recibo.");
  let payments: SalePaymentInput[];
  try { payments = JSON.parse(text(data, "payments")); } catch { throw new Error("Formas de pagamento inválidas."); }
  if (!Array.isArray(payments) || !payments.length || payments.length > 5) throw new Error("Informe ao menos uma forma de pagamento.");
  const normalizedPayments = payments.map((payment) => {
    const method = typeof payment.method === "string" ? payment.method : "";
    const amountInCents = Number(payment.amountInCents);
    if (!['cash', 'card', 'pix'].includes(method) || !Number.isInteger(amountInCents) || amountInCents <= 0) throw new Error("Revise as formas e os valores de pagamento.");
    return { method, amountInCents };
  });
  const paymentMethod = normalizedPayments.length > 1 ? "mixed" : normalizedPayments[0].method;
  const received = data.get("received") === "on";
  const today = organizationDate(new Date(), organization.timezone);

  const createdSale = await db.transaction(async (tx) => {
    const variants = await tx.select({
      id: retailProductVariants.id, inventoryProductId: retailProductVariants.inventoryProductId,
      variantName: retailProductVariants.name, price: retailProductVariants.salePriceInCents,
      commissionRateBasisPoints: retailProductVariants.commissionRateBasisPoints,
      productName: retailProducts.name,
    }).from(retailProductVariants).innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId)).where(and(
      eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isActive, true),
      eq(retailProductVariants.isForSale, true),
      eq(retailProducts.isActive, true), inArray(retailProductVariants.id, variantIds),
    ));
    if (variants.length !== variantIds.length) throw new Error("Um ou mais produtos não estão disponíveis.");
    const stockIds = variants.map((item) => item.inventoryProductId).sort();
    await tx.execute(sql`select id from inventory_products where id in (${sql.join(stockIds.map((id) => sql`${id}`), sql`, `)}) for update`);
    const stock = await tx.select({ id: inventoryProducts.id, balance: inventoryProducts.currentQuantityMillis, cost: inventoryProducts.costInCents }).from(inventoryProducts).where(and(
      eq(inventoryProducts.organizationId, organization.id), inArray(inventoryProducts.id, stockIds), eq(inventoryProducts.isActive, true),
    ));
    const lines = variants.map((variant) => {
      const requestedLine = grouped.get(variant.id)!;
      const requested = requestedLine.quantity;
      const balance = stock.find((item) => item.id === variant.inventoryProductId)?.balance;
      if (balance == null || balance < requested * 1000) throw new Error(`Estoque insuficiente de ${variant.productName} — ${variant.variantName}.`);
      const gross = requested * variant.price;
      if (requestedLine.discountInCents > gross) throw new Error(`O desconto de ${variant.productName} supera o valor do item.`);
      const total = gross - requestedLine.discountInCents;
      const cost = stock.find((item) => item.id === variant.inventoryProductId)?.cost ?? 0;
      return { ...variant, quantity: requested, balance, discount: requestedLine.discountInCents, cost, total, commission: Math.round(total * variant.commissionRateBasisPoints / 10_000) };
    });
    const subtotalInCents = lines.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const discountInCents = lines.reduce((sum, item) => sum + item.discount, 0);
    const totalInCents = subtotalInCents - discountInCents;
    if (normalizedPayments.reduce((sum, payment) => sum + payment.amountInCents, 0) !== totalInCents) throw new Error("A soma dos pagamentos deve ser igual ao total da venda.");
    const [financialEntry] = await tx.insert(financialEntries).values({
      organizationId: organization.id, type: "receivable", status: received ? "received" : "pending",
      source: "retail_sale", description: "Venda de produtos", category: "Venda de produtos",
      amountInCents: totalInCents, dueDate: today, realizedDate: received ? today : null,
      paymentMethod, clientId, notes: text(data, "notes") || null, createdByUserId: session.user.id,
    }).returning({ id: financialEntries.id });
    const [sale] = await tx.insert(retailSales).values({
      organizationId: organization.id, clientId, financialEntryId: financialEntry.id, paymentMethod,
      receiptEmail, receiptPhone: receiptPhoneDigits,
      subtotalInCents, discountInCents, totalInCents, notes: text(data, "notes") || null,
      createdByUserId: session.user.id,
    }).returning({ id: retailSales.id, receiptToken: retailSales.receiptToken });
    await tx.insert(retailSaleItems).values(lines.map((item) => ({
      organizationId: organization.id, saleId: sale.id, variantId: item.id, inventoryProductId: item.inventoryProductId,
      productName: item.productName, variantName: item.variantName, quantity: item.quantity,
      unitPriceInCents: item.price, totalInCents: item.total,
      discountInCents: item.discount, unitCostInCents: item.cost, commissionInCents: item.commission,
    })));
    await tx.insert(retailSalePayments).values(normalizedPayments.map((payment) => ({ organizationId: organization.id, saleId: sale.id, ...payment, status: received ? "received" : "pending" })));
    for (const item of lines) {
      const newBalance = item.balance - item.quantity * 1000;
      await tx.update(inventoryProducts).set({ currentQuantityMillis: newBalance, updatedAt: new Date() }).where(eq(inventoryProducts.id, item.inventoryProductId));
      await tx.insert(inventoryMovements).values({
        organizationId: organization.id, productId: item.inventoryProductId, retailSaleId: sale.id,
        type: "sale", quantityMillis: -item.quantity * 1000, balanceAfterMillis: newBalance,
        notes: `Venda ${sale.id.slice(0, 8)}`, createdByUserId: session.user.id,
      });
    }
    return sale;
  });
  const receiptPath = `/recibo/${createdSale.receiptToken}`;
  const receiptUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}${receiptPath}`;
  const notifications: Promise<unknown>[] = [];
  if (data.get("sendReceiptEmail") === "on" && receiptEmail && receiptUrl.startsWith("http")) notifications.push(sendRetailReceiptEmail({ email: receiptEmail, organizationName: organization.name, receiptUrl, saleId: createdSale.id }));
  if (data.get("sendReceiptWhatsapp") === "on" && receiptPhoneDigits && receiptUrl.startsWith("http")) {
    const [channel] = await db.select({ id: whatsappChannels.id, phoneNumberId: whatsappChannels.phoneNumberId }).from(whatsappChannels).where(and(eq(whatsappChannels.organizationId, organization.id), eq(whatsappChannels.isActive, true))).limit(1);
    if (channel) {
      const to = receiptPhoneDigits.startsWith("55") ? receiptPhoneDigits : `55${receiptPhoneDigits}`;
      notifications.push(db.insert(outboxEvents).values({ organizationId: organization.id, eventKey: `whatsapp:retail-receipt:${createdSale.id}`, eventType: "whatsapp.message.send", aggregateType: "retail_sale", aggregateId: createdSale.id, payload: { organizationId: organization.id, channelId: channel.id, phoneNumberId: channel.phoneNumberId, to, text: `Obrigado pela compra na ${organization.name}! Seu recibo não fiscal: ${receiptUrl}` } }).onConflictDoNothing({ target: outboxEvents.eventKey }).then(() => triggerOutboxWorker()));
    }
  }
  const notificationResults = await Promise.allSettled(notifications);
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "retail_sale", entityId: createdSale.id });
  revalidatePath("/vendas"); revalidatePath("/produtos"); revalidatePath("/estoque"); revalidatePath("/financeiro");
  return { openUrl: receiptPath, warning: notificationResults.some((result) => result.status === "rejected") ? "Venda concluída, mas um dos envios do recibo falhou." : undefined };
}

export async function reverseRetailSale(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "sales.cancel");
  const saleId = text(data, "saleId");
  const operation = text(data, "operation") === "refund" ? "refunded" : "cancelled";
  const reason = text(data, "reason");
  if (reason.length < 5) throw new Error("Informe o motivo com pelo menos 5 caracteres.");

  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from retail_sales where id = ${saleId} for update`);
    const [sale] = await tx.select({ id: retailSales.id, status: retailSales.status, financialEntryId: retailSales.financialEntryId }).from(retailSales).where(and(eq(retailSales.id, saleId), eq(retailSales.organizationId, organization.id))).limit(1);
    if (!sale) throw new Error("Venda não encontrada.");
    if (sale.status !== "completed") throw new Error("Esta venda já foi cancelada ou estornada.");
    const items = await tx.select({ productId: retailSaleItems.inventoryProductId, quantity: retailSaleItems.quantity }).from(retailSaleItems).where(and(eq(retailSaleItems.saleId, saleId), eq(retailSaleItems.organizationId, organization.id)));
    const productIds = [...new Set(items.map((item) => item.productId))].sort();
    await tx.execute(sql`select id from inventory_products where id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)}) for update`);
    for (const item of items) {
      const [product] = await tx.select({ balance: inventoryProducts.currentQuantityMillis }).from(inventoryProducts).where(and(eq(inventoryProducts.id, item.productId), eq(inventoryProducts.organizationId, organization.id))).limit(1);
      if (!product) throw new Error("Produto da venda não encontrado no estoque.");
      const quantityMillis = item.quantity * 1000;
      const newBalance = product.balance + quantityMillis;
      await tx.update(inventoryProducts).set({ currentQuantityMillis: newBalance, updatedAt: new Date() }).where(eq(inventoryProducts.id, item.productId));
      await tx.insert(inventoryMovements).values({ organizationId: organization.id, productId: item.productId, retailSaleId: saleId, type: operation === "refunded" ? "sale_refund" : "sale_cancellation", quantityMillis, balanceAfterMillis: newBalance, notes: reason, createdByUserId: session.user.id });
    }
    await tx.update(retailSales).set({ status: operation, cancelledAt: new Date(), cancelledByUserId: session.user.id, cancellationReason: reason }).where(eq(retailSales.id, saleId));
    await tx.update(retailSalePayments).set({ status: operation }).where(and(eq(retailSalePayments.saleId, saleId), eq(retailSalePayments.organizationId, organization.id)));
    if (sale.financialEntryId) await tx.update(financialEntries).set({ status: operation, updatedAt: new Date() }).where(and(eq(financialEntries.id, sale.financialEntryId), eq(financialEntries.organizationId, organization.id)));
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: operation, entityType: "retail_sale", entityId: saleId, details: { reason } });
  revalidatePath("/vendas"); revalidatePath("/vendas/historico"); revalidatePath("/vendas/relatorios"); revalidatePath("/estoque"); revalidatePath("/financeiro");
}
