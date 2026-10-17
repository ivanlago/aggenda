import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { clientPortalDependents, clients } from "@/db/schema";

export class PortalPatients {
  constructor(private database: typeof db) {}
  async list(organizationId: string, guardianId: string) {
    return this.database.select({ id: clients.id, name: clients.name }).from(clientPortalDependents)
      .innerJoin(clients, and(eq(clients.id, clientPortalDependents.clientId), eq(clients.organizationId, clientPortalDependents.organizationId)))
      .where(and(eq(clientPortalDependents.organizationId, organizationId), eq(clientPortalDependents.guardianId, guardianId))).orderBy(clients.name);
  }
  async resolve(organizationId: string, guardianId: string, patientId?: string) {
    const id = patientId || guardianId;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return undefined;
    if (id !== guardianId) {
      const [relationship] = await this.database.select({ id: clientPortalDependents.clientId }).from(clientPortalDependents)
        .where(and(eq(clientPortalDependents.organizationId, organizationId), eq(clientPortalDependents.guardianId, guardianId), eq(clientPortalDependents.clientId, id))).limit(1);
      if (!relationship) return undefined;
    }
    const [patient] = await this.database.select({ id: clients.id, name: clients.name, phone: clients.phone, email: clients.email }).from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.id, id))).limit(1);
    return patient;
  }
}
