import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { clientPackageBalances, clientPackages, servicePackages, services } from "@/db/schema";
import { requireN8nOrganization } from "@/lib/n8n-api";

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;
  const clientId = request.nextUrl.searchParams.get("clientId");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const filters = [
    eq(clientPackageBalances.organizationId, auth.organization.id),
    eq(clientPackages.clientId, clientId),
    eq(clientPackages.status, "active"),
    lt(clientPackageBalances.usedQuantity, clientPackageBalances.totalQuantity),
    or(isNull(clientPackages.expiresAt), gt(clientPackages.expiresAt, new Date())),
  ];
  if (serviceId) filters.push(eq(clientPackageBalances.serviceId, serviceId));
  const items = await db.select({
    clientPackageId: clientPackages.id,
    packageName: servicePackages.name,
    serviceId: services.id,
    serviceName: services.name,
    totalQuantity: clientPackageBalances.totalQuantity,
    usedQuantity: clientPackageBalances.usedQuantity,
    expiresAt: clientPackages.expiresAt,
  }).from(clientPackageBalances)
    .innerJoin(clientPackages, eq(clientPackages.id, clientPackageBalances.clientPackageId))
    .innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
    .innerJoin(services, eq(services.id, clientPackageBalances.serviceId))
    .where(and(...filters));

  return NextResponse.json({
    packages: items.map((item) => ({ ...item, remainingQuantity: item.totalQuantity - item.usedQuantity })),
  });
}
