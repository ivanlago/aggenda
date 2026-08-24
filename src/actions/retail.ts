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
  retailSales,
  serviceInventoryItems,
  whatsappChannels,
} from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";
import { sendRetailReceiptEmail } from "@/lib/email";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";
import { assertOrganizationPermission } from "@/lib/permissions";
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

type SaleInputItem = { variantId?: unknown; quantity?: unknown };

export async function registerRetailSale(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  let parsed: SaleInputItem[];
  try { parsed = JSON.parse(text(data, "items")); } catch { throw new Error("Itens da venda inválidos."); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 50) throw new Error("Adicione ao menos um produto à venda.");
  const grouped = new Map<string, number>();
  for (const item of parsed) {
    const variantId = typeof item.variantId === "string" ? item.variantId : "";
    const quantity = Number(item.quantity);
    if (!variantId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10_000) throw new Error("Revise os produtos e as quantidades da venda.");
    grouped.set(variantId, (grouped.get(variantId) ?? 0) + quantity);
  }
  const variantIds = [...grouped.keys()];
  const clientId = text(data, "clientId") || null;
  const [client] = clientId ? await db.select({ id: clients.id, email: clients.email, phone: clients.phone }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1) : [];
  if (clientId && !client) throw new Error("Cliente não encontrado.");
  const receiptEmail = text(data, "receiptEmail") || client?.email || null;
  const receiptPhone = text(data, "receiptPhone") || client?.phone || null;
  if (receiptEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail)) throw new Error("Informe um e-mail válido para o recibo.");
  const receiptPhoneDigits = receiptPhone?.replace(/\D/g, "") || null;
  if (receiptPhoneDigits && receiptPhoneDigits.length < 10) throw new Error("Informe um WhatsApp válido para o recibo.");
  const discountInCents = money(data, "discount", false);
  const paymentMethod = text(data, "paymentMethod") || null;
  const received = data.get("received") === "on";
  const today = organizationDate(new Date(), organization.timezone);

  const createdSale = await db.transaction(async (tx) => {
    const variants = await tx.select({
      id: retailProductVariants.id, inventoryProductId: retailProductVariants.inventoryProductId,
      variantName: retailProductVariants.name, price: retailProductVariants.salePriceInCents,
      productName: retailProducts.name,
    }).from(retailProductVariants).innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId)).where(and(
      eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isActive, true),
      eq(retailProductVariants.isForSale, true),
      eq(retailProducts.isActive, true), inArray(retailProductVariants.id, variantIds),
    ));
    if (variants.length !== variantIds.length) throw new Error("Um ou mais produtos não estão disponíveis.");
    const stockIds = variants.map((item) => item.inventoryProductId).sort();
    await tx.execute(sql`select id from inventory_products where id in (${sql.join(stockIds.map((id) => sql`${id}`), sql`, `)}) for update`);
    const stock = await tx.select({ id: inventoryProducts.id, balance: inventoryProducts.currentQuantityMillis }).from(inventoryProducts).where(and(
      eq(inventoryProducts.organizationId, organization.id), inArray(inventoryProducts.id, stockIds), eq(inventoryProducts.isActive, true),
    ));
    const lines = variants.map((variant) => {
      const requested = grouped.get(variant.id)!;
      const balance = stock.find((item) => item.id === variant.inventoryProductId)?.balance;
      if (balance == null || balance < requested * 1000) throw new Error(`Estoque insuficiente de ${variant.productName} — ${variant.variantName}.`);
      return { ...variant, quantity: requested, balance, total: requested * variant.price };
    });
    const subtotalInCents = lines.reduce((sum, item) => sum + item.total, 0);
    if (discountInCents > subtotalInCents) throw new Error("O desconto não pode superar o subtotal.");
    const totalInCents = subtotalInCents - discountInCents;
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
    })));
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
