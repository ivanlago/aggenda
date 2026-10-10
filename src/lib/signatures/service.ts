import { createHash, randomUUID } from "node:crypto";
import type { SignatureAuthorization, SignatureInput, SignatureProvider, SignatureRepository, SignatureRequest, SignatureStorage, SignatureValidator } from "./types";

const hash = (pdf: Uint8Array) => createHash("sha256").update(pdf).digest("hex");

export class SignatureService {
  constructor(private readonly dependencies: {
    provider: SignatureProvider;
    repository: SignatureRepository;
    storage: SignatureStorage;
    validator: SignatureValidator;
    authorization: SignatureAuthorization;
  }) {}

  async start(input: SignatureInput): Promise<SignatureRequest> {
    const { repository, storage, provider, authorization } = this.dependencies;
    if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128 || !/^\d{11}$/.test(input.signerCpf) || !input.pdf.byteLength) {
      throw new Error("Solicitação de assinatura inválida.");
    }
    // Capture bytes before the first await so callers cannot mutate the signed payload.
    const frozen = { ...input, pdf: Uint8Array.from(input.pdf) };
    input = frozen;
    const inputHash = hash(frozen.pdf);
    await authorization.assertCanSign({ ...frozen, documentHash: inputHash });
    let request = await repository.findByKey(input.organizationId, input.idempotencyKey);
    if (!request) {
      const id = randomUUID();
      const originalKey = `signatures/${id}/original.pdf`;
      await storage.put(input.organizationId, originalKey, frozen.pdf);
      request = await repository.createOrGet({
        id, organizationId: input.organizationId, documentId: input.documentId,
        professionalId: input.professionalId, userId: input.userId, signerCpf: input.signerCpf,
        idempotencyKey: input.idempotencyKey, inputHash, originalKey, sizeBytes: frozen.pdf.byteLength,
        provider: provider.name, providerId: null, status: "PENDING",
      });
    }
    if (request.inputHash !== inputHash || request.documentId !== input.documentId ||
        request.professionalId !== input.professionalId || request.signerCpf !== input.signerCpf ||
        request.userId !== input.userId || request.provider !== provider.name) {
      throw new Error("Chave idempotente já utilizada em outra solicitação.");
    }
    if (request.status !== "PENDING" || request.providerId) return request;
    // A network failure remains PENDING; a retry uses the same provider key.
    const result = await provider.start({ ...frozen, idempotencyKey: `${request.organizationId}:${request.id}` });
    const attached = await repository.attachProvider(input.organizationId, request.id, result.id);
    if (!attached) {
      const current = await repository.find(input.organizationId, request.id);
      if (!current) throw new Error("Solicitação não encontrada.");
      return current;
    }
    return { ...request, providerId: result.id };
  }

  async reconcile(organizationId: string, id: string): Promise<void> {
    const { repository, provider, validator, storage } = this.dependencies;
    const request = await repository.find(organizationId, id);
    if (!request) throw new Error("Solicitação não encontrada.");
    if (request.status !== "PENDING" || !request.providerId) return;
    if (request.provider !== provider.name) throw new Error("Provedor incompatível.");
    const result = await provider.getStatus(request.providerId);
    if (result.status === "PENDING") return;
    if (result.status !== "COMPLETED") {
      await repository.finish(organizationId, id, result.status, { code: "provider_terminal" });
      return;
    }
    // A mock can exercise the flow but can NEVER create a qualified signature.
    if (provider.simulated) {
      await repository.finish(organizationId, id, "FAILED", { code: "simulation_only" });
      return;
    }
    const pdf = Uint8Array.from(result.pdf);
    const validation = await validator.validate(pdf, request.inputHash);
    if (validation.outcome === "unavailable") return;
    if (validation.outcome !== "valid" || !validation.qualified || validation.signerCpf !== request.signerCpf) {
      await repository.finish(organizationId, id, "FAILED", { code: "validation_rejected" });
      return;
    }
    const signedHash = hash(pdf);
    const signedKey = `signatures/${id}/${signedHash}.pdf`;
    await storage.put(organizationId, signedKey, pdf);
    await repository.finish(organizationId, id, "SIGNED", {
      signedKey, signedHash, signedSizeBytes: pdf.byteLength, certificateFingerprint: validation.certificateFingerprint,
    });
  }

  async cancel(organizationId: string, id: string, userId: string): Promise<void> {
    const { repository, provider, authorization } = this.dependencies;
    const request = await repository.find(organizationId, id);
    if (!request || request.userId !== userId) throw new Error("Solicitação não encontrada.");
    await authorization.assertCanSign({ organizationId, userId, professionalId: request.professionalId,
      documentId: request.documentId, signerCpf: request.signerCpf, documentHash: request.inputHash });
    if (request.status !== "PENDING") return;
    if (request.provider !== provider.name || !request.providerId || !provider.cancel) {
      throw new Error("O cancelamento exige confirmação do método de assinatura.");
    }
    await provider.cancel(request.providerId);
    // A successful HTTP cancellation call is not sufficient: confirm terminal status.
    const result = await provider.getStatus(request.providerId);
    if (result.status === "CANCELLED") {
      await repository.finish(organizationId, id, "CANCELLED", { code: "provider_cancelled" });
    } else if (result.status === "COMPLETED" || result.status === "FAILED") {
      await this.reconcile(organizationId, id);
    }
  }
}
