"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export async function saveOwnSignatureImage(formData: FormData) {
  const { organization, session } = await requireOrganization();
  let signatureImage: string | null = null;
  if (formData.get("operation") !== "remove") {
    const file = formData.get("signature");
    if (!(file instanceof File) || file.size < 24 || file.size > 250_000) {
      return { error: "Selecione uma imagem PNG de até 250 KB." };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        !width || !height || width > 1600 || height > 800) {
      return { error: "Use um PNG válido de até 1600 × 800 pixels." };
    }
    try {
      const pdf = await PDFDocument.create();
      await pdf.embedPng(bytes);
    } catch {
      return { error: "O arquivo não contém uma imagem PNG válida." };
    }
    signatureImage = `data:image/png;base64,${bytes.toString("base64")}`;
  }
  const [updated] = await db.update(professionals).set({ signatureImage, updatedAt: new Date() })
    .where(and(eq(professionals.organizationId, organization.id),
      eq(professionals.userId, session.user.id), eq(professionals.isActive, true)))
    .returning({ id: professionals.id });
  if (!updated) return { error: "Seu acesso precisa estar vinculado a um profissional ativo." };
  revalidatePath("/equipe/minha-assinatura");
}
