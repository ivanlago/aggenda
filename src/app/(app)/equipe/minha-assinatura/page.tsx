/* eslint-disable @next/next/no-img-element */
import { and, eq } from "drizzle-orm";
import { saveOwnSignatureImage } from "@/actions/signature-image";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export default async function MySignaturePage() {
  const { session, organization } = await requireOrganization();
  const [professional] = await db.select({ image: professionals.signatureImage }).from(professionals)
    .where(and(eq(professionals.organizationId, organization.id),
      eq(professionals.userId, session.user.id), eq(professionals.isActive, true))).limit(1);

  return <div className="page-wrap">
    <PageHeader eyebrow="Equipe" title="Minha assinatura visual" description="Cadastre uma imagem da sua assinatura para usar nos modelos de documentos que você emitir." />
    <section className="panel grid gap-4">
      {!professional ? <p>Seu acesso precisa estar vinculado a um profissional ativo.</p> : <>
        <p className="text-sm text-muted">Use @AssinaturaProfissional no modelo. O Aggenda insere a imagem na emissão. A assinatura com certificado digital é um fluxo separado.</p>
        {professional.image && <img src={professional.image} alt="Sua assinatura visual" className="max-h-32 max-w-xs object-contain" />}
        <ActionForm action={saveOwnSignatureImage} successMessage="Imagem salva." className="grid gap-3">
          <label className="grid gap-2 text-sm font-bold">Imagem PNG (até 250 KB e 1600 × 800 pixels)
            <input className="field" type="file" name="signature" accept="image/png" required />
          </label>
          <div><button className="primary-button">{professional.image ? "Substituir imagem" : "Salvar imagem"}</button></div>
        </ActionForm>
        {professional.image && <ActionForm action={saveOwnSignatureImage} successMessage="Imagem removida.">
          <input type="hidden" name="operation" value="remove" />
          <button className="secondary-button">Remover imagem</button>
        </ActionForm>}
      </>}
    </section>
  </div>;
}
