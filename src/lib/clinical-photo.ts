export function parseClinicalVisitDate(value: string | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Data da visita inválida.");
  return value;
}

type ClinicalPhotoSource = { id: string; mediaType: string; phase: string; captureSession: string | null; bodyRegion: string | null; viewCode: string | null; consentPurpose: string };
export function validateClinicalPhotoPair<T extends ClinicalPhotoSource>(sources: T[]) {
  const before = sources.find(item => item.phase === "before");
  const after = sources.find(item => item.phase === "after");
  if (sources.length !== 2 || !before || !after || sources.some(item => item.mediaType !== "photo") || !before.captureSession || !before.bodyRegion || !before.viewCode || before.captureSession !== after.captureSession || before.bodyRegion !== after.bodyRegion || before.viewCode !== after.viewCode) throw new Error("Selecione fotos Antes e Depois do mesmo tratamento, região e vista.");
  return { before, after, consentPurpose: before.consentPurpose === after.consentPurpose ? before.consentPurpose : "clinical" };
}

