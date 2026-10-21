import { db } from "@/db";
import { searchReferenceCatalog } from "./reference-catalog";

export type TussCatalogItem = Awaited<ReturnType<typeof searchTussCatalog>>[number];
export async function searchTussCatalog(table: "20" | "22", query: string, limit = 100) {
  const result = await searchReferenceCatalog(db, `tuss-${table}`, query, { limit });
  return result.items.map(item => ({ code: item.code, name: item.name, table, validFrom: item.validFrom, validUntil: item.validUntil, laboratory: item.laboratory, presentation: item.presentation, reference: item.reference, eligible: item.eligible }));
}
