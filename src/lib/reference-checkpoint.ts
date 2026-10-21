import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const maxAge = 6 * 60 * 60 * 1000;
export const checkpointHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Download scratch space only. Publication always runs the full catalog validation. */
export class ReferenceCheckpoint {
  private prepared?: Promise<void>;
  constructor(private directory: string, private identity: string) {
    if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error("Identidade de checkpoint inválida.");
  }
  private path(page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 5000) throw new Error("Página de checkpoint inválida.");
    return join(this.directory, `tuss-${this.identity}-${page}.json`);
  }
  private prepare() {
    return this.prepared ??= (async () => {
      await mkdir(this.directory, { recursive: true });
      for (const name of await readdir(this.directory)) {
        if (!/^tuss-[a-f0-9]{64}-\d+\.json(?:\.[a-f0-9-]+\.tmp)?$/.test(name)) continue;
        const path = join(this.directory, name);
        try { if (Date.now() - (await stat(path)).mtimeMs > maxAge) await unlink(path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    })();
  }
  async read<T>(page: number): Promise<T | undefined> {
    await this.prepare();
    try {
      const raw = await readFile(this.path(page), "utf8");
      if (raw.length > 5_000_000) return;
      const saved = JSON.parse(raw);
      if (saved.identity !== this.identity || saved.page !== page || !Number.isFinite(saved.savedAt) || saved.savedAt > Date.now() || Date.now() - saved.savedAt > maxAge || saved.checksum !== checkpointHash(saved.rows)) return;
      return saved.rows as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return;
      throw error;
    }
  }
  async write(page: number, rows: unknown) {
    await this.prepare();
    const target = this.path(page), temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ identity: this.identity, page, savedAt: Date.now(), rows, checksum: checkpointHash(rows) }), { mode: 0o600, flag: "wx" });
      await rename(temporary, target);
    } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
  async clear(pageCount: number) {
    for (let page = 1; page <= pageCount; page++) await unlink(this.path(page)).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
