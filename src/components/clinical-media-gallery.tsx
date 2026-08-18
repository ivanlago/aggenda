"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createClientClinicalMedia, deleteClientClinicalMedia } from "@/actions/app";
import { ActionForm } from "@/components/action-form";

type MediaItem = { id: string; title: string | null; phase: string; src: string };
const phaseLabels: Record<string, string> = { before: "Antes", during: "Durante", after: "Depois", clinical: "Clínico" };

export function ClinicalMediaGallery({ clientId, media }: { clientId: string; media: MediaItem[] }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [comparison, setComparison] = useState<string[]>([]);
  const [split, setSplit] = useState(50);
  const [annotating, setAnnotating] = useState<MediaItem | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = comparison.map((id) => media.find((item) => item.id === id)).filter(Boolean) as MediaItem[];

  useEffect(() => {
    if (!annotating || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(960 / image.width, 640 / image.height, 1);
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = annotating.src;
  }, [annotating]);

  function toggleComparison(id: string) {
    setComparison((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-1), id]);
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  }

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    const position = point(event);
    context?.beginPath();
    context?.moveTo(position.x, position.y);
    if (context) { context.strokeStyle = "#ef4444"; context.lineWidth = 4; context.lineCap = "round"; }
    setDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const context = event.currentTarget.getContext("2d");
    const position = point(event);
    context?.lineTo(position.x, position.y);
    context?.stroke();
  }

  function saveAnnotation() {
    const canvas = canvasRef.current;
    if (!canvas || !annotating) return;
    canvas.toBlob((blob) => {
      if (!blob) return setMessage("Não foi possível gerar a imagem anotada.");
      startTransition(async () => {
        const formData = new FormData();
        formData.set("clientId", clientId);
        formData.set("parentMediaId", annotating.id);
        formData.set("phase", annotating.phase);
        formData.set("title", `${annotating.title || "Registro clínico"} — anotação`);
        formData.set("consentConfirmed", "on");
        formData.set("file", new File([blob], "anotacao-clinica.webp", { type: "image/webp" }));
        try {
          await createClientClinicalMedia(formData);
          setAnnotating(null);
          setMessage("Anotação salva como uma nova versão.");
          router.refresh();
        } catch {
          setMessage("Não foi possível salvar a anotação.");
        }
      });
    }, "image/webp", 0.86);
  }

  return <div className="mt-5">
    {selected.length === 2 && <div className="mb-5 rounded-2xl border bg-black p-3">
      <div className="relative mx-auto aspect-[4/3] max-w-3xl overflow-hidden rounded-xl">
        <Image src={selected[0].src} alt={selected[0].title || "Comparação anterior"} fill unoptimized className="object-contain" />
        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${split}%` }}>
          <div className="relative h-full" style={{ width: `${10000 / split}%` }}><Image src={selected[1].src} alt={selected[1].title || "Comparação posterior"} fill unoptimized className="object-contain" /></div>
        </div>
        <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${split}%` }} />
      </div>
      <input className="mt-3 w-full accent-brand" type="range" min="5" max="95" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Divisor da comparação" />
    </div>}
    {message && <p className="mb-3 text-sm font-bold text-brand" role="status">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{media.map((item) => <article key={item.id} className="rounded-2xl border p-3">
      <div className="relative aspect-square"><Image className="rounded-xl object-cover" src={item.src} alt={item.title || "Fotografia clínica"} fill unoptimized /></div>
      <p className="mt-2 font-bold">{item.title || "Registro clínico"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="status-pill">{phaseLabels[item.phase] ?? item.phase}</span>
        <button type="button" className={`text-xs font-bold ${comparison.includes(item.id) ? "text-brand" : "text-muted"}`} onClick={() => toggleComparison(item.id)}>Comparar</button>
        <button type="button" className="text-xs font-bold text-brand" onClick={() => setAnnotating(item)}>Anotar</button>
        <ActionForm action={deleteClientClinicalMedia} successMessage="Fotografia excluída."><input type="hidden" name="mediaId" value={item.id} /><button className="text-xs font-bold text-red-600">Excluir</button></ActionForm>
      </div>
    </article>)}</div>
    {!media.length && <p className="empty-state">Nenhuma fotografia clínica registrada.</p>}
    {annotating && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Anotar fotografia clínica">
      <div className="max-h-[95vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-extrabold">Anotação clínica</h3><p className="text-sm text-muted">Desenhe em vermelho sobre a imagem. O original será preservado.</p></div><button type="button" className="secondary-button" onClick={() => setAnnotating(null)}>Fechar</button></div>
        <canvas ref={canvasRef} className="mx-auto max-h-[65vh] max-w-full touch-none rounded-xl bg-black" onPointerDown={startDraw} onPointerMove={draw} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)} />
        <button type="button" className="primary-button mt-4" disabled={pending} onClick={saveAnnotation}>{pending ? "Salvando…" : "Salvar como nova versão"}</button>
      </div>
    </div>}
  </div>;
}
