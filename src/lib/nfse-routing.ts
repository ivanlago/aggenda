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
  };
}

function governmentParametersBase(environment: string) {
  if (environment === "production") return process.env.NFSE_GOVERNMENT_PARAMETERS_URL || "https://adn.nfse.gov.br/parametrizacao";
  return process.env.NFSE_GOVERNMENT_PARAMETERS_SANDBOX_URL || "https://adn.producaorestrita.nfse.gov.br/parametrizacao";
}

export async function checkGovernmentNfseCompatibility(municipalityCode: string, environment: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${governmentParametersBase(environment)}/parametros_municipais/${municipalityCode}/convenio`, { headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (response.status === 404 || response.status === 422) return { status: "incompatible" as const, message: "O município não está habilitado para emissão pela SEFIN Nacional." };
    if (!response.ok) return { status: "unavailable" as const, message: `A consulta ao ambiente nacional está temporariamente indisponível (HTTP ${response.status}).` };
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    const explicitlyDisabled = payload && [payload.aderente, payload.emissorNacional, payload.habilitado].some((value) => value === false);
    if (explicitlyDisabled) return { status: "incompatible" as const, message: "O convênio municipal não autoriza o Emissor Público Nacional para este contribuinte." };
    return { status: "compatible" as const, message: "Município disponível para emissão direta pelo ambiente nacional." };
  } catch {
    return { status: "unavailable" as const, message: "Não foi possível consultar o ambiente nacional agora. Tente novamente antes de usar o parceiro." };
  } finally {
    clearTimeout(timeout);
  }
}

export function selectNfseRoute(status: NfseFiscalProfile["compatibilityStatus"], partnerFallbackAuthorized: boolean): NfseFiscalProfile["routingMode"] {
  if (status === "compatible") return "government";
  if (status === "incompatible" && partnerFallbackAuthorized) return "partner";
  return "pending_analysis";
}
