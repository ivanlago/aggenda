import { inflateRawSync } from "node:zlib";

type ZipEntry = { name: string; offset: number; compressed: number; size: number; method: number; crc: number; flags: number };
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function zipCrc(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fetch only selected workbooks, not the hundreds of MB of unrelated OPME. */
export async function readOfficialZip(url: string, select: (name: string) => boolean) {
  const head = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!head.ok) throw new Error(`Pacote ANS respondeu HTTP ${head.status}.`);
  const length = Number(head.headers.get("content-length")), etag = head.headers.get("etag");
  if (!Number.isSafeInteger(length) || length < 22 || length > 2_000_000_000 || !etag || etag.startsWith("W/")) throw new Error("Pacote ANS sem tamanho/identificador estável.");
  async function range(start: number, end: number) {
    if (start < 0 || end >= length || end < start || end - start > 20_000_000) throw new Error("Intervalo ZIP inválido.");
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}`, "If-Match": etag! }, redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${start}-${end}/${length}` || response.headers.get("etag") !== etag) {
      await response.body?.cancel();
      throw new Error("Servidor ANS não confirmou intervalo/versão do ZIP.");
    }
    const chunks: Uint8Array[] = []; let received = 0;
    const reader = response.body!.getReader();
    try {
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        received += chunk.length;
        if (received > end - start + 1) throw new Error("Intervalo ZIP acima do tamanho esperado.");
        chunks.push(chunk);
      }
    } finally { await reader.cancel(); }
    if (received !== end - start + 1) throw new Error("Intervalo ZIP incompleto.");
    return Buffer.concat(chunks);
  }
  const tail = await range(Math.max(0, length - 65557), length - 1);
  let end = tail.length - 22;
  while (end >= 0 && (tail.readUInt32LE(end) !== 0x06054b50 || end + 22 + tail.readUInt16LE(end + 20) !== tail.length)) end--;
  if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) throw new Error("Índice ZIP inválido ou dividido em volumes.");
  const count = tail.readUInt16LE(end + 10), size = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16);
  if (count < 1 || count > 1000 || size > 1_000_000 || offset + size !== length - tail.length + end) throw new Error("Índice ZIP inesperado (ZIP64 não suportado).");
  const directory = await range(offset, offset + size - 1);
  const entries: ZipEntry[] = []; let cursor = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Entrada ZIP inválida.");
    const nameSize = directory.readUInt16LE(cursor + 28), extra = directory.readUInt16LE(cursor + 30), comment = directory.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameSize + extra + comment;
    if (next > directory.length) throw new Error("Índice ZIP truncado.");
    const flags = directory.readUInt16LE(cursor + 8);
    const name = new TextDecoder(flags & 0x800 ? "utf-8" : "windows-1252").decode(directory.subarray(cursor + 46, cursor + 46 + nameSize));
    if (select(name)) entries.push({ name, flags, method: directory.readUInt16LE(cursor + 10), crc: directory.readUInt32LE(cursor + 16), compressed: directory.readUInt32LE(cursor + 20), size: directory.readUInt32LE(cursor + 24), offset: directory.readUInt32LE(cursor + 42) });
    cursor = next;
  }
  if (cursor !== directory.length || entries.length !== 1) throw new Error("Planilha TUSS ausente ou ambígua no pacote ANS.");
  const entry = entries[0];
  if (entry.flags & 1 || ![0, 8].includes(entry.method) || entry.compressed > 20_000_000 || entry.size > 100_000_000 || entry.offset + 30 >= offset) throw new Error("Planilha ZIP fora dos limites suportados.");
  const local = await range(entry.offset, entry.offset + 29);
  if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(6) !== entry.flags || local.readUInt16LE(8) !== entry.method) throw new Error("Cabeçalho ZIP inconsistente.");
  const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  if (start + entry.compressed > offset) throw new Error("Conteúdo ZIP fora do intervalo esperado.");
  const compressed = await range(start, start + entry.compressed - 1);
  const bytes = entry.method === 8 ? inflateRawSync(compressed, { maxOutputLength: 100_000_000 }) : compressed;
  if (bytes.length !== entry.size || zipCrc(bytes) !== entry.crc) throw new Error("Integridade da planilha ANS inválida.");
  return { bytes, name: entry.name, modifiedAt: head.headers.get("last-modified") };
}
