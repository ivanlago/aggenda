export type NfseFiscalProfile = {
  cnpj: string;
  municipalRegistration: string;
  municipalityCode: string;
  taxRegime: "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";
  routingMode: "government" | "partner" | "pending_analysis";
  compatibilityStatus: "not_checked" | "compatible" | "incompatible" | "unavailable";
  compatibilityCheckedAt?: string;
  compatibilityMessage?: string;
  partnerFallbackAuthorized: boolean;
  certificateExpiresAt?: string;
  certificateFingerprint?: string;
  dpsSeries?: string;
};

export type NfseCertificateSecret = {
  pfxBase64: string;
  password: string;
  fileName: string;
};

export function readNfseProfile(metadata: Record<string, unknown> | null | undefined): NfseFiscalProfile | null {
  const profile = metadata?.fiscalProfile;
  if (!profile || typeof profile !== "object") return null;
  const value = profile as Partial<NfseFiscalProfile>;
  if (!value.cnpj || !value.municipalityCode || !value.municipalRegistration || !value.taxRegime) return null;
  return {
    cnpj: value.cnpj,
    municipalRegistration: value.municipalRegistration,
    municipalityCode: value.municipalityCode,
    taxRegime: value.taxRegime,
    routingMode: value.routingMode ?? "pending_analysis",
    compatibilityStatus: value.compatibilityStatus ?? "not_checked",
    compatibilityCheckedAt: value.compatibilityCheckedAt,
    compatibilityMessage: value.compatibilityMessage,
    partnerFallbackAuthorized: value.partnerFallbackAuthorized === true,
    certificateExpiresAt: value.certificateExpiresAt,
    certificateFingerprint: value.certificateFingerprint,
    dpsSeries: value.dpsSeries,
  };
}

export async function checkGovernmentNfseCompatibility(municipalityCode: string, transport: import("./nfse/government").FiscalTransport) {
  try {
    const response = await transport(`/${municipalityCode}/convenio`, { service: "parameters" });
    return interpretMunicipalAgreement(response.status, response.body);
  } catch {
    return { status: "unavailable" as const, message: "Consulta indisponível. Verifique o certificado e tente novamente." };
  }
}
export function interpretMunicipalAgreement(status: number, payload: Record<string, unknown> | null) {
  // Unknown or numeric flags require confirmation against the authenticated API contract.
  // Never treat an arbitrary HTTP 200 or a missing field as municipal approval.
  if (status === 200 && payload?.aderenteEmissorNacional === true) return { status: "compatible" as const, message: "Convênio indica adesão ao emissor nacional. A autorização da clínica depende da validação da DPS." };
  if (status === 200 && payload?.aderenteEmissorNacional === false) return { status: "incompatible" as const, message: "Convênio não indica adesão ao emissor nacional. Cobertura por parceiro requer análise." };
  return { status: "unavailable" as const, message: "Não foi possível confirmar a adesão municipal. A emissão de teste é a validação efetiva do contribuinte." };
}

export function selectNfseRoute(status: NfseFiscalProfile["compatibilityStatus"], partnerFallbackAuthorized: boolean): NfseFiscalProfile["routingMode"] {
  if (status === "compatible") return "government";
  // Authorization alone is not a configured, homologated partner integration.
  void partnerFallbackAuthorized;
  return "pending_analysis";
}
