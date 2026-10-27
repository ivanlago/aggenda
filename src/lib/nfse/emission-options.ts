export type NfseEmissionMode = "external" | "a1" | "municipal";
export function nfseEmissionMode(value: unknown, hasProfile = false): NfseEmissionMode {
  return value === "external" || value === "a1" || value === "municipal" ? value : hasProfile ? "a1" : "external";
}
export function nfseRequirements(municipalityCode: string, regime: string) {
  const validMunicipality = /^\d{7}$/.test(municipalityCode);
  const validRegime = ["simples_nacional", "lucro_presumido", "lucro_real", "mei"].includes(regime);
  return {
    identified: validMunicipality && validRegime,
    government: { certificate: "A1 com CNPJ do prestador", status: "pilot" as const },
    // A municipal password is not usable until an actual connector has been homologated.
    municipal: { available: false, status: "pending_analysis" as const },
    external: { available: true, certificateInAggenda: false },
  };
}
