import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { reservedPackageQuantity } from "@/lib/package-remaining";
import { clientPackageBalances, clientPackages, servicePackages, services } from "@/db/schema";

export type PosPackageBalance = {
  id: string;
  clientId: string;
  clientPackageId: string;
  serviceId: string;
  packageName: string;
  serviceName: string;
  remaining: number;
  reserved?: number;
  expiresAt: string | null;
  expired: boolean;
};

export async function getPosPackageBalances(organizationId: string, clientId?: string): Promise<PosPackageBalance[]> {
  const rows = await db.select({
    id: clientPackageBalances.id,
    clientId: clientPackages.clientId,
    clientPackageId: clientPackages.id,
    serviceId: clientPackageBalances.serviceId,
    packageName: servicePackages.name,
    serviceName: services.name,
    remaining: sql<number>`${clientPackageBalances.totalQuantity} - ${clientPackageBalances.usedQuantity}`,
    reserved: reservedPackageQuantity,
    expiresAt: clientPackages.expiresAt,
  }).from(clientPackageBalances)
    .innerJoin(clientPackages, eq(clientPackages.id, clientPackageBalances.clientPackageId))
    .innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
    .innerJoin(services, eq(services.id, clientPackageBalances.serviceId))
    .where(and(
      eq(clientPackageBalances.organizationId, organizationId),
      eq(clientPackages.organizationId, organizationId),
      eq(servicePackages.organizationId, organizationId),
      eq(services.organizationId, organizationId),
      clientId ? eq(clientPackages.clientId, clientId) : undefined,
      eq(clientPackages.status, "active"),
      gt(clientPackageBalances.totalQuantity, sql`${clientPackageBalances.usedQuantity} - ${reservedPackageQuantity}`),
    )).orderBy(asc(clientPackages.expiresAt), asc(servicePackages.name), asc(services.name));
  const now = Date.now();
  return rows.map((row) => ({ ...row, expiresAt: row.expiresAt?.toISOString() ?? null, expired: row.expiresAt !== null && row.expiresAt.getTime() <= now }));
}
