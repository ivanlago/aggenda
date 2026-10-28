import { sql } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { nfseMunicipalityReference } from "./municipalities";

export const nfseOnboardingSchema = z.object({
  cnpj: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().regex(/^\d{14}$/, "Informe o CNPJ com 14 dígitos.")),
  municipalityCode: z.enum(["2927408", "2919207", "2905701"], { error: "Selecione Salvador, Lauro de Freitas ou Camaçari." }),
  taxRegime: z.enum(["simples_nacional", "lucro_presumido", "lucro_real", "mei"]),
  municipalRegistration: z.string().trim().max(40).default(""),
});
export type NfseOnboarding = z.infer<typeof nfseOnboardingSchema>;

export function readNfseOnboarding(metadata: Record<string, unknown> | null | undefined): NfseOnboarding | null {
  const result = nfseOnboardingSchema.safeParse(metadata?.fiscalOnboarding);
  return result.success ? result.data : null;
}

export async function storeNfseOnboarding(database: typeof db, organizationId: string, userId: string, input: NfseOnboarding, placeholderCredential: string) {
  const onboarding = nfseOnboardingSchema.parse(input);
  const reference = nfseMunicipalityReference(onboarding.municipalityCode, onboarding.taxRegime)!;
  const metadata = { fiscalOnboarding: { ...onboarding, suggestedChannel: reference.suggestedChannel, referenceReviewedAt: reference.reviewedAt, preparedAt: new Date().toISOString(), preparedByUserId: userId } };
  // The update is atomic and deliberately preserves active/revoked credentials, profile,
  // environment, consent and status. An intake is never a configuration or activation.
  await database.insert(organizationFinancialIntegrations).values({ organizationId, provider: "nfse", environment: "sandbox", status: "requested", encryptedCredential: placeholderCredential, metadata }).onConflictDoUpdate({
    target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider],
    set: { metadata: sql`coalesce(${organizationFinancialIntegrations.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`, updatedAt: new Date() },
  });
}
