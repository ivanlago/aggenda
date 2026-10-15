"use server";

import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, clinicalAttachments, documentSignatureBlobs } from "@/db/schema";
import { requireClinicalClient } from "@/lib/clinical-access";
import { signatureEncryption } from "@/lib/signatures/storage-config";

export async function uploadClinicalAttachment(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const { organization, session } = await requireClinicalClient(clientId, true);
  const file = form.get("file"); const title = String(form.get("title") ?? "").trim();
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024 || file.type !== "application/pdf" || title.length < 2 || title.length > 150) return { error: "Informe um título e selecione um PDF de até 3 MiB." };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return { error: "O arquivo não é um PDF válido." };
  try { const document = await PDFDocument.load(bytes); if (!document.getPageCount()) throw new Error(); }
  catch { return { error: "PDF inválido ou protegido por senha. Envie uma cópia legível." }; }
  const id = randomUUID(); const storageKey = `clinical/${clientId}/${id}.pdf`;
  const encryptedContent = signatureEncryption().encrypt(organization.id, storageKey, bytes);
  await db.transaction(async tx => {
    await tx.insert(documentSignatureBlobs).values({ organizationId: organization.id, storageKey, encryptedContent });
    await tx.insert(clinicalAttachments).values({ id, organizationId: organization.id, clientId, storageKey, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length, title, authorUserId: session.user.id });
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "upload", entityType: "clinical_attachment", entityId: id });
  });
  revalidatePath(`/clientes/${clientId}`); revalidatePath("/atendimento", "layout");
}

export async function reviewClinicalAttachment(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const { organization, session } = await requireClinicalClient(clientId, true);
  if (form.get("confirmReview") !== "on") return { error: "Confirme que revisou o documento." };
  await db.transaction(async tx => {
    const [row] = await tx.update(clinicalAttachments).set({ reviewedByUserId: session.user.id, reviewedAt: new Date() }).where(and(eq(clinicalAttachments.id, String(form.get("id") ?? "")), eq(clinicalAttachments.organizationId, organization.id), eq(clinicalAttachments.clientId, clientId), isNull(clinicalAttachments.reviewedAt))).returning({ id: clinicalAttachments.id });
    if (row) await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "review", entityType: "clinical_attachment", entityId: row.id });
  });
  revalidatePath(`/clientes/${clientId}`); revalidatePath("/atendimento", "layout");
}
