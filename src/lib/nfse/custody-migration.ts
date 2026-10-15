import { and, eq } from "drizzle-orm";
import type { db } from "../../db";
import { auditLogs, nfseRequestEvents, nfseRequests, organizationFinancialIntegrations } from "../../db/schema";
import { isNfseEnvelope, readStoredNfseValue, type NfseVault } from "./vault";

/** Explicit tenant-scoped, atomic migration. Dry run decrypts/verifies but never writes. */
export async function migrateNfseCustody(database: typeof db, organizationId: string, vault: NfseVault, apply = false) {
  return database.transaction(async (tx) => {
    let certificates = 0; let artifacts = 0;
    const reencrypt = (slot: string, value: string) => {
      const plain = isNfseEnvelope(value) ? vault.decrypt(organizationId, slot, value) : readStoredNfseValue(organizationId, slot, value);
      if (isNfseEnvelope(value) && value.split(".")[1] === vault.activeKey) return value;
      return vault.encrypt(organizationId, slot, plain);
    };
    const integrations = await tx.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organizationId), eq(organizationFinancialIntegrations.provider, "nfse"))).for("update");
    for (const row of integrations) {
      if (!["configured", "active"].includes(row.status)) continue;
      const encrypted = reencrypt("certificate", row.encryptedCredential);
      if (encrypted === row.encryptedCredential) continue;
      certificates++;
      if (apply) {
        await tx.update(organizationFinancialIntegrations).set({ encryptedCredential: encrypted, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, row.id));
        await tx.insert(auditLogs).values({ organizationId, action: "rotate_nfse_custody", entityType: "financial_integration:nfse", details: { keyId: vault.activeKey, source: "maintenance_script" } });
      }
    }
    const rows = await tx.select().from(nfseRequests).where(eq(nfseRequests.organizationId, organizationId)).for("update");
    for (const row of rows) {
      const values: Partial<typeof nfseRequests.$inferInsert> = {};
      const fields = { encryptedDraft: "draft", encryptedDps: "dps", encryptedXml: "xml", encryptedCancellation: "cancellation", encryptedEvent: "event" } as const;
      for (const [field, slot] of Object.entries(fields) as Array<[keyof typeof fields, string]>) {
        const old = row[field];
        if (old) {
          const encrypted = reencrypt(`${row.id}/${slot}`, old);
          if (encrypted !== old) { values[field] = encrypted; artifacts++; }
        }
      }
      if (apply && Object.keys(values).length) {
        await tx.update(nfseRequests).set(values).where(and(eq(nfseRequests.id, row.id), eq(nfseRequests.organizationId, organizationId)));
        await tx.insert(nfseRequestEvents).values({ organizationId, requestId: row.id, type: "custody_rotated", details: { keyId: vault.activeKey } });
      }
    }
    return { mode: apply ? "applied" : "dry_run", certificates, artifacts, activeKeyId: vault.activeKey };
  });
}
