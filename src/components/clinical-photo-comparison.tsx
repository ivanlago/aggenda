"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type Photo = { id: string; src: string; title: string | null; phase: string };
export function ClinicalPhotoComparison({ photos }: { photos: Photo[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sideBySide, setSideBySide] = useState(true);
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState([100, 100]);
  function content() {
    return <>
      <div className="mb-3 flex flex-wrap gap-2"><button type="button" className="secondary-button" aria-pressed={sideBySide} onClick={() => setSideBySide(true)}>Lado a lado</button><button type="button" className="secondary-button" aria-pressed={!sideBySide} onClick={() => setSideBySide(false)}>Sobreposição</button></div>
      {sideBySide ? <div className="grid grid-cols-2 gap-2">{photos.map((photo, index) => <div key={photo.id}><p className="mb-1 text-sm">{photo.title || (photo.phase === "before" ? "Antes" : photo.phase === "after" ? "Depois" : "Evolução")}</p><div className="relative aspect-square overflow-auto bg-black"><div className="relative h-full w-full" style={{ width: `${zoom[index]}%`, height: `${zoom[index]}%` }}><Image src={photo.src} alt={photo.title || `Fotografia ${index + 1}`} fill unoptimized className="object-contain" /></div></div><label className="mt-2 block text-xs">Zoom da foto {index + 1}: {zoom[index]}%<input className="block w-full" type="range" min="100" max="300" step="10" value={zoom[index]} onChange={event => setZoom(current => current.map((value, i) => i === index ? Number(event.target.value) : value))} /></label></div>)}</div> : <><div className="relative mx-auto aspect-[4/3] max-h-[70vh] overflow-hidden bg-black"><Image src={photos[0].src} alt={photos[0].title || "Primeira fotografia"} fill unoptimized className="object-contain" /><div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}><Image src={photos[1].src} alt={photos[1].title || "Segunda fotografia"} fill unoptimized className="object-contain" /></div><div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${split}%` }} /></div><input className="mt-3 w-full" aria-label="Divisor da comparação" type="range" min="5" max="95" value={split} onChange={event => setSplit(Number(event.target.value))} /></>}
    </>;
  }
  return <>
    <div className="mb-3 text-white">{content()}<button type="button" className="secondary-button mt-3" onClick={() => dialog.current?.showModal()}>Abrir comparação em tela cheia</button></div>
    <dialog ref={dialog} className="fixed inset-0 m-auto max-h-[96vh] w-[96vw] max-w-none overflow-auto rounded-xl bg-slate-950 p-4 text-white backdrop:bg-black/80" aria-label="Comparação de fotografias"><button type="button" className="secondary-button mb-3" onClick={() => dialog.current?.close()}>Fechar comparação</button>{content()}</dialog>
  </>;
}
