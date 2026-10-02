import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, clients, voucherDeliveries, voucherRedemptions, vouchers } from "@/db/schema";
import { hasOrganizationPermission, type OrganizationRole } from "@/lib/permissions";
import { voucherChannels } from "@/lib/voucher-delivery";
import { voucherBenefit, voucherBookingUrl } from "@/lib/voucher-rules";
import { VoucherManager } from "@/components/voucher-manager";

export async function VouchersPanel({ organization, referenceTime }: { referenceTime: number; organization: { id: string; name: string; slug: string; role: OrganizationRole; timezone: string; customDomain: string | null; customDomainVerifiedAt: Date | null } }) {
  const [voucherRows, clientRows, deliveries, redemptions, channels] = await Promise.all([
    db.select().from(vouchers).where(eq(vouchers.organizationId, organization.id)).orderBy(desc(vouchers.createdAt)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone,
      lastCompleted: sql<string | null>`(select max(${appointments.startsAt}) from ${appointments} where ${appointments.clientId} = ${clients.id} and ${appointments.organizationId} = ${organization.id} and ${appointments.status} = 'completed')`,
    }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: voucherDeliveries.id, voucherCode: vouchers.code, clientName: clients.name, campaignName: voucherDeliveries.campaignName, channel: voucherDeliveries.channel, status: voucherDeliveries.status, lastError: voucherDeliveries.lastError, createdAt: voucherDeliveries.createdAt, sentAt: voucherDeliveries.sentAt }).from(voucherDeliveries).innerJoin(vouchers, eq(vouchers.id, voucherDeliveries.voucherId)).innerJoin(clients, eq(clients.id, voucherDeliveries.clientId)).where(eq(voucherDeliveries.organizationId, organization.id)).orderBy(desc(voucherDeliveries.createdAt)).limit(100),
    db.select({ id: voucherRedemptions.id, voucherCode: vouchers.code, clientName: clients.name, discount: voucherRedemptions.discountInCents, createdAt: voucherRedemptions.createdAt }).from(voucherRedemptions).innerJoin(vouchers, eq(vouchers.id, voucherRedemptions.voucherId)).innerJoin(clients, eq(clients.id, voucherRedemptions.clientId)).where(and(eq(voucherRedemptions.organizationId, organization.id))).orderBy(desc(voucherRedemptions.createdAt)).limit(100),
    voucherChannels(organization.id),
  ]);
  return <VoucherManager organizationName={organization.name} timezone={organization.timezone} referenceTime={referenceTime}
    canCreate={hasOrganizationPermission(organization.role, "services.manage")} canSend={hasOrganizationPermission(organization.role, "crm.manage")}
    channels={channels} clients={clientRows.map((client) => ({ ...client, lastCompleted: client.lastCompleted ? new Date(client.lastCompleted).toISOString() : null }))}
    vouchers={voucherRows.map((voucher) => ({ ...voucher, createdAt: voucher.createdAt.toISOString(), validFrom: voucher.validFrom.toISOString(), validUntil: voucher.validUntil?.toISOString() ?? null,
      benefit: voucherBenefit(voucher), bookingUrl: voucherBookingUrl(organization, voucher.code, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    }))}
    deliveries={deliveries.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), sentAt: row.sentAt?.toISOString() ?? null }))}
    redemptions={redemptions.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} />;
}
