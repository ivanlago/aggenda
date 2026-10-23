import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { localSignatureReadiness } from "@/lib/signatures/local-config";

export async function GET() {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.sign");
  if (!localSignatureReadiness(organization.id).ready) return Response.json({ error: "Piloto indisponível." }, { status: 403 });
  const bytes = await readFile(join(process.cwd(), "agents/windows/dist/Aggenda.Assinador.zip"));
  return new Response(bytes, { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=Aggenda.Assinador.zip", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
