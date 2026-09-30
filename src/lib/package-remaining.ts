import { sql } from "drizzle-orm";
import { clientPackageBalances } from "@/db/schema";

// Keep historical counters intact: a reserved session is committed, but not consumed.
export const reservedPackageQuantity = sql<number>`((select coalesce(sum(pu.quantity), 0)::int from package_usages pu where pu.balance_id = ${clientPackageBalances.id} and pu.status = 'reserved') + (select coalesce(sum(api.quantity), 0)::int from attendance_package_items api where api.balance_id = ${clientPackageBalances.id} and api.status = 'reserved'))`;
export const consumedPackageQuantity = sql<number>`${clientPackageBalances.usedQuantity} - ${reservedPackageQuantity}`;
