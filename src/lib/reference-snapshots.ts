import { z } from "zod";
import type { ReferenceDatabase } from "./reference-catalog";
import { resolveCatalogReference } from "./reference-catalog";
import { referenceKinds } from "./reference-types";

const referenceSchema = z.object({ kind: z.enum(referenceKinds), releaseId: z.uuid(), version: z.string().max(200), code: z.string().min(1).max(100), name: z.string().min(1).max(2000) });
export async function serviceCatalogReference(database: ReferenceDatabase, form: FormData) {
  const raw = String(form.get("tussReference") ?? "").trim();
  if (!raw) return null;
  const reference = referenceSchema.parse(JSON.parse(raw));
  if (reference.code !== String(form.get("tussCode") ?? "") || reference.kind !== `tuss-${String(form.get("tussTable") ?? "")}`) throw new Error("Selecione novamente o código TUSS do procedimento.");
  return resolveCatalogReference(database, reference, new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bahia" }).format(new Date()));
}

export async function snapshotDocumentReferences(database: ReferenceDatabase, data: Record<string, unknown> | null, today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bahia" }).format(new Date())) {
  const references = new Map<string, ReturnType<typeof resolveCatalogReference>>();
  async function walk(value: unknown, depth = 0): Promise<unknown> {
    if (depth > 12) throw new Error("Estrutura de documento inválida.");
    if (Array.isArray(value)) return Promise.all(value.map(item => walk(item, depth + 1)));
    if (!value || typeof value !== "object") return value;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if ((key === "catalogReference" || key === "reference") && item != null) {
        const parsed = referenceSchema.parse(item);
        const id = `${parsed.releaseId}:${parsed.code}`;
        if (!references.has(id)) references.set(id, resolveCatalogReference(database, parsed, today));
        output[key] = await references.get(id);
      } else output[key] = await walk(item, depth + 1);
    }
    return output;
  }
  return await walk(data) as Record<string, unknown> | null;
}
