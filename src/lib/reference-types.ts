export const referenceKinds = ["tuss-20", "tuss-22", "cid-10", "anvisa-medications"] as const;
export type ReferenceKind = typeof referenceKinds[number];
export type CatalogReference = { kind: ReferenceKind; releaseId: string; version: string; code: string; name: string };
export type ReferenceEntry = {
  code: string; name: string; abbreviatedName?: string | null; laboratory?: string | null;
  presentation?: string | null; substance?: string | null; registrationStatus?: string | null;
  validFrom?: string | null; validUntil?: string | null; active?: boolean;
};
export function normalizeReference(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function referenceSearchText(entry: ReferenceEntry) {
  const text = normalizeReference([entry.code, entry.name, entry.abbreviatedName, entry.laboratory, entry.presentation, entry.substance].filter(Boolean).join(" "));
  // Curated spelling aliases only; no inferred clinical equivalences.
  const aliases = [/\brm\b/.test(text) && "ressonancia magnetica", /\btc\b/.test(text) && "tomografia computadorizada", /\brx\b/.test(text) && "radiografia raio x raios x", /\bus\b|ultrassonografia/.test(text) && "ultrassom ultrassonografia"];
  return `${text} ${aliases.filter(Boolean).join(" ")}`.trim();
}
export function referenceDate(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw || raw === "-") return null;
  const date = /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? raw.split("/").reverse().join("-") : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Data inválida no catálogo: ${raw}`);
  return date;
}
