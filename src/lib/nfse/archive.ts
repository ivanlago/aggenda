import JSZip from "jszip";

export type FiscalArchiveFile = { id: string; status: string; xml: string; eventXml?: string };
export async function fiscalArchive(files: FiscalArchiveFile[]) {
  if (!files.length || files.length > 500) throw new Error("Selecione um período com 1 a 500 notas.");
  const zip = new JSZip(); let bytes = 0;
  for (const file of files) {
    if (!/^[0-9a-f-]{36}$/i.test(file.id) || !["authorized", "cancelled", "cancellation_processing", "cancellation_uncertain"].includes(file.status)) throw new Error("Arquivo fiscal inválido.");
    bytes += Buffer.byteLength(file.xml) + Buffer.byteLength(file.eventXml ?? "");
    if (bytes > 25 * 1024 * 1024) throw new Error("A exportação excede 25 MB. Escolha um período menor.");
    zip.file(`notas/${file.id}.xml`, file.xml);
    if (file.eventXml) zip.file(`eventos/${file.id}-cancelamento.xml`, file.eventXml);
  }
  zip.file("manifesto.json", JSON.stringify({ environment: "sandbox", selection: "request_creation_date", documents: files.map(({ id, status }) => ({ id, status })) }, null, 2));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
