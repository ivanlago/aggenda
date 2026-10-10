import { createHash } from "node:crypto";
import type { ProviderResult, SignatureInput, SignatureProvider } from "../types";

/** Test double only: returns the original bytes, never a cryptographic signature. */
export class MockSignatureProvider implements SignatureProvider {
  readonly name = "mock";
  readonly simulated = true;
  private readonly results = new Map<string, ProviderResult>();

  async start(input: SignatureInput) {
    const id = createHash("sha256").update(input.idempotencyKey).digest("hex");
    if (!this.results.has(id)) this.results.set(id, { status: "COMPLETED", pdf: Uint8Array.from(input.pdf) });
    return { id };
  }

  async getStatus(id: string): Promise<ProviderResult> {
    const result = this.results.get(id);
    if (!result) throw new Error("Solicitação simulada não encontrada.");
    return result.status === "COMPLETED" ? { ...result, pdf: Uint8Array.from(result.pdf) } : result;
  }

  async cancel(id: string) {
    const result = await this.getStatus(id);
    if (result.status !== "PENDING") throw new Error("Solicitação já finalizada.");
    this.results.set(id, { status: "CANCELLED" });
  }
}
