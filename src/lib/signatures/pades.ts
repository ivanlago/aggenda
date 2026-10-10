import { createHash } from "node:crypto";
import { PDFDocument, PDFName } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";

const MAX_PDF = 10 * 1024 * 1024;
const HEX_CAPACITY = 65536;
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

// Restricted to PDFs prepared here, with one signature and no incremental revisions.
// This is a byte-binding check, NOT an ICP trust/revocation validator.
export function inspectPreparedPdf(input: Uint8Array) {
  const pdf = Buffer.from(input);
  if (!pdf.length || pdf.length > MAX_PDF) throw new Error("Tamanho do PDF inválido.");
  const text = pdf.toString("latin1");
  const ranges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  if (ranges.length !== 1 || (text.match(/\/ByteRange\b/g) ?? []).length !== 1) {
    throw new Error("Esperada uma única assinatura preparada.");
  }
  const [start, length, tail, tailLength] = ranges[0].slice(1).map(Number);
  if (![start, length, tail, tailLength].every(Number.isSafeInteger) || start !== 0 ||
      length <= 0 || tail <= length || tail + tailLength !== pdf.length || tail - length !== HEX_CAPACITY + 2 ||
      pdf[length] !== 60 || pdf[tail - 1] !== 62 ||
      !/^[0-9a-fA-F]+$/.test(text.slice(length + 1, tail - 1)) ||
      !/\/Contents\s*$/.test(text.slice(Math.max(0, length - 30), length)) ||
      !text.includes("/SubFilter /ETSI.CAdES.detached")) {
    throw new Error("ByteRange ou reserva de assinatura inválidos.");
  }
  const content = Buffer.concat([pdf.subarray(0, length), pdf.subarray(tail)]);
  const original = Buffer.from(pdf);
  original.fill(48, length + 1, tail - 1);
  return { pdf, content, originalHash: sha256(original), contentHash: sha256(content), length, tail };
}

export async function preparePadesPdf(input: Uint8Array): Promise<Uint8Array> {
  if (!input.length || input.length > MAX_PDF) throw new Error("Tamanho do PDF inválido.");
  const doc = await PDFDocument.load(input);
  // Rewriting an existing signed document invalidates its signatures. Reject the pilot case.
  if (doc.getForm().getFields().some(field => field.acroField.dict.get(PDFName.of("FT"))?.toString() === "/Sig") ||
      /\/ByteRange\b/.test(Buffer.from(input).toString("latin1"))) {
    throw new Error("O piloto não aceita PDF com assinatura anterior.");
  }
  if (!doc.getPageCount()) throw new Error("PDF sem páginas.");
  pdflibAddPlaceholder({ pdfDoc: doc, reason: "Assinatura profissional Aggenda", contactInfo: "",
    name: "", location: "", appName: "Aggenda", signatureLength: HEX_CAPACITY,
    subFilter: "ETSI.CAdES.detached", byteRangePlaceholder: "AggendaByteRange" });
  const pdf = Buffer.from(await doc.save({ useObjectStreams: false }));
  const text = pdf.toString("latin1");
  const marker = /\/ByteRange\s*\[\s*0\s+\/AggendaByteRange\s+\/AggendaByteRange\s+\/AggendaByteRange\s*\]/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length !== 1) throw new Error("Reserva ByteRange não encontrada.");
  const contents = /\/Contents\s*<([^>]*)>/.exec(text.slice(matches[0].index));
  if (!contents || contents[1].length !== HEX_CAPACITY) throw new Error("Reserva Contents inválida.");
  const opening = matches[0].index! + contents.index + contents[0].indexOf("<");
  const tail = opening + HEX_CAPACITY + 2;
  const range = `/ByteRange [0 ${opening} ${tail} ${pdf.length - tail}]`;
  if (range.length > matches[0][0].length) throw new Error("Reserva ByteRange insuficiente.");
  pdf.write(range.padEnd(matches[0][0].length, " "), matches[0].index, "latin1");
  pdf.fill(48, opening + 1, tail - 1);
  inspectPreparedPdf(pdf);
  return pdf;
}

export function embedDetachedCms(prepared: Uint8Array, cms: Uint8Array): Uint8Array {
  const parsed = inspectPreparedPdf(prepared);
  if (!/^0+$/.test(parsed.pdf.toString("latin1", parsed.length + 1, parsed.tail - 1))) {
    throw new Error("PDF já contém assinatura.");
  }
  if (!cms.length || cms.length * 2 > HEX_CAPACITY || cms[0] !== 0x30) throw new Error("CMS inválido ou excede a reserva.");
  parsed.pdf.write(Buffer.from(cms).toString("hex").padEnd(HEX_CAPACITY, "0"), parsed.length + 1, "ascii");
  return parsed.pdf;
}

export function assertPadesBinding(signed: Uint8Array, expectedOriginalHash: string): void {
  const parsed = inspectPreparedPdf(signed);
  if (parsed.originalHash !== expectedOriginalHash || /^0+$/.test(parsed.pdf.toString("latin1", parsed.length + 1, parsed.tail - 1))) {
    throw new Error("Assinatura não corresponde ao PDF preparado.");
  }
}
