import { createHash } from "node:crypto";
import type { ProviderResult, SignatureInput, SignatureMethod, SignatureProvider } from "../types";

export interface SigningOperation {
  id: string;
  idempotencyKey: string;
  documentHash: string;
}

/** Vendor or authenticated local-agent bridge. Must persist idempotency across
 * processes, serialize duplicate starts and bind operations to the authenticated
 * tenant/account. null means definitively absent; network errors MUST throw.
 * Implementations must not return patient document URLs for the browser to fetch. */
export interface ResumableSigningTransport {
  findByKey(key: string): Promise<SigningOperation | null>;
  start(input: SignatureInput): Promise<SigningOperation>;
  get(id: string): Promise<{ id: string; result: ProviderResult }>;
  cancel?(id: string): Promise<void>;
}

/** Shared recovery policy, not a vendor implementation or a production local bridge. */
export class ResumableSignatureProvider implements SignatureProvider {
  readonly simulated = false;
  readonly cancel?: (id: string) => Promise<void>;

  constructor(readonly name: string, readonly method: SignatureMethod,
    private readonly transport: ResumableSigningTransport) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(name) || name === "mock") throw new Error("Método de assinatura inválido.");
    if (transport.cancel) this.cancel = async (id) => { await transport.cancel!(id); };
  }

  async start(input: SignatureInput): Promise<{ id: string }> {
    const frozen = { ...input, pdf: Uint8Array.from(input.pdf) };
    const documentHash = createHash("sha256").update(frozen.pdf).digest("hex");
    const existing = await this.transport.findByKey(frozen.idempotencyKey);
    const operation = existing ?? await this.transport.start(frozen);
    if (!operation.id || operation.id.length > 512 || operation.idempotencyKey !== frozen.idempotencyKey || operation.documentHash !== documentHash) {
      throw new Error("O método retornou uma operação incompatível com o documento autorizado.");
    }
    return { id: operation.id };
  }

  async getStatus(id: string): Promise<ProviderResult> {
    const response = await this.transport.get(id);
    if (response.id !== id) throw new Error("O método retornou outra solicitação.");
    const result = response.result;
    if (!["PENDING", "COMPLETED", "FAILED", "CANCELLED"].includes(result.status)) throw new Error("Resultado de assinatura desconhecido.");
    if (result.status === "COMPLETED") {
      if (!(result.pdf instanceof Uint8Array) || !result.pdf.byteLength || result.pdf.byteLength > 10 * 1024 * 1024) throw new Error("PDF assinado fora dos limites.");
      return { status: "COMPLETED", pdf: Uint8Array.from(result.pdf) };
    }
    return { status: result.status };
  }
}
