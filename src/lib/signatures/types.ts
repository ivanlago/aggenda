export type SignatureStatus = "PENDING" | "SIGNED" | "FAILED" | "CANCELLED";

export interface SignatureInput {
  organizationId: string;
  documentId: string;
  professionalId: string;
  userId: string;
  signerCpf: string;
  idempotencyKey: string;
  pdf: Uint8Array;
}

export interface SignatureRequest {
  id: string;
  organizationId: string;
  documentId: string;
  professionalId: string;
  userId: string;
  signerCpf: string;
  idempotencyKey: string;
  inputHash: string;
  originalKey: string;
  sizeBytes: number;
  provider: string;
  providerId: string | null;
  status: SignatureStatus;
}

export type ProviderResult =
  | { status: "PENDING" }
  | { status: "FAILED" | "CANCELLED" }
  | { status: "COMPLETED"; pdf: Uint8Array };

export interface SignatureProvider {
  readonly name: string;
  readonly simulated: boolean;
  // Implementations MUST honor this key across retries, including ambiguous timeouts.
  start(input: SignatureInput): Promise<{ id: string }>;
  getStatus(id: string): Promise<ProviderResult>;
  cancel?(id: string): Promise<void>;
}

export type ValidationResult =
  | { outcome: "unavailable" }
  | { outcome: "invalid"; code: string }
  | { outcome: "valid"; qualified: boolean; signerCpf: string; certificateFingerprint: string };

export interface SignatureValidator {
  // Must check signed revision against originalHash, all relevant signatures,
  // trust chain, policy, revocation and validity; metadata alone is insufficient.
  validate(pdf: Uint8Array, originalHash: string): Promise<ValidationResult>;
}

export interface SignatureStorage {
  // Keys are private, immutable and scoped to the organization. No public URL.
  put(organizationId: string, key: string, pdf: Uint8Array): Promise<void>;
  get(organizationId: string, key: string): Promise<Uint8Array>;
}

export interface SignatureRepository {
  findByKey(organizationId: string, key: string): Promise<SignatureRequest | null>;
  find(organizationId: string, id: string): Promise<SignatureRequest | null>;
  // Must atomically return the existing row on a unique-key conflict.
  createOrGet(request: SignatureRequest): Promise<SignatureRequest>;
  attachProvider(organizationId: string, id: string, providerId: string): Promise<boolean>;
  // Atomically compare PENDING, update status, and append a minimized audit event.
  finish(organizationId: string, id: string, status: Exclude<SignatureStatus, "PENDING">,
    evidence: { code?: string; signedKey?: string; signedHash?: string; signedSizeBytes?: number; certificateFingerprint?: string }): Promise<boolean>;
}

export interface SignatureAuthorization {
  // Must verify tenant, document eligibility, permission, user/professional link,
  // expected CPF and strengthened authentication. Called even on retries.
  assertCanSign(input: Omit<SignatureInput, "pdf" | "idempotencyKey"> & { documentHash: string }): Promise<void>;
}
