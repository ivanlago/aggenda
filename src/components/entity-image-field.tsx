import Image from "next/image";

export function EntityImageField({ currentUrl, label = "Imagem" }: { currentUrl?: string | null; label?: string }) {
  return (
    <div className="grid gap-2 sm:col-span-2">
      <label className="grid gap-2 text-sm font-bold">
        {label}
        <input className="field file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" type="file" name="image" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
      </label>
      <p className="text-xs text-muted">JPG, PNG, WebP ou HEIC, até 10 MB. A imagem será otimizada automaticamente.</p>
      {currentUrl && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-surface-soft p-3">
          <Image className="size-16 rounded-lg object-cover" src={currentUrl} alt="Imagem atual" width={64} height={64} sizes="64px" />
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="removeImage" />Remover imagem atual</label>
        </div>
      )}
    </div>
  );
}

export function EntityThumbnail({ src, alt, fallback }: { src?: string | null; alt: string; fallback: string }) {
  return src
    ? <Image className="size-11 shrink-0 rounded-xl object-cover" src={src} alt={alt} width={44} height={44} sizes="44px" />
    : <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 font-extrabold text-brand">{fallback}</span>;
}
