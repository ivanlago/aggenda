import Image from "next/image";

export function OrganizationLogoField({ currentUrl, disabled }: { currentUrl: string | null; disabled: boolean }) {
  return <div className="grid min-w-0 content-start gap-2 sm:col-span-2">
    <label className="grid content-start gap-2 text-sm font-bold">Logo da empresa<input className="field file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" type="file" name="image" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={disabled} /></label>
    <p className="text-xs text-muted">Selecione a logo e clique em Salvar identidade institucional. Ela será usada no cabeçalho dos documentos emitidos e no agendamento online. JPG, PNG, WebP ou HEIC, até 10 MB.</p>
    {currentUrl && <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-white p-3"><Image src={currentUrl} alt="Logo atual da empresa" width={120} height={80} unoptimized className="h-20 w-30 object-contain" /><label className="flex items-center gap-2 text-sm font-bold"><input name="removeImage" type="checkbox" disabled={disabled} />Remover logo atual</label></div>}
  </div>;
}
