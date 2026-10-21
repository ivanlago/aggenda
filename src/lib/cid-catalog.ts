import { db } from "@/db";
import { searchReferenceCatalog } from "./reference-catalog";

export type CidCatalogItem = Awaited<ReturnType<typeof searchCidCatalog>>[number];
export async function searchCidCatalog(query: string, limit = 30) {
  const result = await searchReferenceCatalog(db, "cid-10", query, { limit });
  return result.items.map(item => ({ code: item.code, description: item.name, abbreviatedDescription: item.abbreviatedName ?? "", reference: item.reference }));
}
