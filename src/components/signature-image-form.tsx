"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { saveOwnSignatureImage } from "@/actions/signature-image";
import { ActionForm } from "@/components/action-form";

export function SignatureImageForm({ image }: { image: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return <ActionForm action={saveOwnSignatureImage} successMessage="Assinatura visual salva." onSuccess={() => setPreview(null)} className="grid gap-3">
    <label className="grid gap-1 text-sm font-bold">Imagem PNG (até 250 KB e 1600 × 800 pixels)
      <input className="field" type="file" name="signature" accept="image/png" required onChange={event => {
        const file = event.target.files?.[0];
        setPreview(file ? URL.createObjectURL(file) : null);
      }}/>
    </label>
    {(preview || image) && <figure className="grid gap-2 rounded-xl border bg-white p-3">
      <figcaption className="text-xs text-muted">{preview ? "Prévia da assinatura selecionada — salve para confirmar." : "Assinatura visual cadastrada"}</figcaption>
      <img src={preview || image!} alt={preview ? "Prévia da assinatura visual selecionada" : "Sua assinatura visual"} className="max-h-40 max-w-full justify-self-start object-contain"/>
    </figure>}
    <div className="flex justify-end"><button className="primary-button">Salvar assinatura visual</button></div>
  </ActionForm>;
}
