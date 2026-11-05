"use client";

import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";

export function CatalogImageField({ currentUrl, label }: { currentUrl?: string | null; label: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState("");
  const imageUrl = previewUrl ?? (removeImage ? null : currentUrl);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return <div className="grid min-w-0 content-start gap-2">
    <label className="group relative flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-surface-soft text-center text-sm font-bold text-muted focus-within:ring-2 focus-within:ring-brand hover:border-brand">
      <span className="sr-only">{label} (opcional)</span>
      <input className="sr-only" type="file" name="image" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setError("Selecione uma imagem de até 10 MB."); event.target.value = ""; setPreviewUrl(null); return; }
        setError("");
        setRemoveImage(false);
        setPreviewUrl(URL.createObjectURL(file));
      }} />
      {imageUrl ? <>
        <Image key={imageUrl} src={imageUrl} alt={label} fill unoptimized sizes="176px" className="object-contain" onError={() => setError("Não foi possível exibir a prévia deste formato. Selecione JPG, PNG ou WebP para visualizar.")} />
        <span className="absolute inset-x-0 bottom-0 bg-slate-950/65 py-1.5 text-xs text-white">Trocar imagem</span>
      </> : <><ImagePlus className="size-7" aria-hidden="true" /><span>Adicionar imagem</span><span className="text-xs font-normal">Opcional</span></>}
    </label>
    <p className="text-xs text-muted">JPG, PNG, WebP ou HEIC, até 10 MB.</p>
    {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
    {currentUrl && !previewUrl && <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="removeImage" checked={removeImage} onChange={event => setRemoveImage(event.target.checked)} />Remover imagem atual</label>}
  </div>;
}
