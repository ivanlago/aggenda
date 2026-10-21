import { db } from "@/db";
import { getSession } from "@/lib/session";
import { ReferenceUnavailable, searchReferenceCatalog } from "./reference-catalog";
import type { ReferenceKind } from "./reference-types";

export async function referenceResponse(request: Request, kind: ReferenceKind) {
  if (!(await getSession())?.user) return Response.json({ error: "Não autorizado", available: false, items: [] }, { status: 401 });
  const params = new URL(request.url).searchParams;
  try {
    const result = await searchReferenceCatalog(db, kind, params.get("q") ?? "", { page: Number(params.get("page")), includeInactive: params.get("includeInactive") === "true" });
    const items = result.items.map(item => kind === "cid-10" ? { code: item.code, description: item.name, abbreviatedDescription: item.abbreviatedName ?? "", reference: item.reference, eligible: item.eligible } : {
      code: item.code, name: item.name, table: kind === "anvisa-medications" ? null : kind === "tuss-22" ? "22" : "20", source: kind === "anvisa-medications" ? "anvisa" : "tuss",
      validFrom: item.validFrom, validUntil: item.validUntil, laboratory: item.laboratory, presentation: item.presentation, substance: item.substance, registrationStatus: item.registrationStatus, eligible: item.eligible, reference: item.reference,
    });
    return Response.json({ ...result, items, available: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ items: [], available: false, error: error instanceof ReferenceUnavailable ? error.message : "Não foi possível consultar o catálogo." }, { status: error instanceof ReferenceUnavailable ? 503 : 500 });
  }
}
