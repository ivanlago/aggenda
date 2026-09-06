"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ReferencePhoto = { id: string; src: string; label: string };

export function GuidedClinicalPhotoInput({ references }: { references: ReferencePhoto[] }) {
  const inputRef = useRef<HTMLInputElement>(null); const videoRef = useRef<HTMLVideoElement>(null); const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false); const [preview, setPreview] = useState<string | null>(null); const [referenceId, setReferenceId] = useState(""); const [opacity, setOpacity] = useState(35); const [error, setError] = useState("");
  const reference = references.find((item) => item.id === referenceId);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function openCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1600 }, height: { ideal: 1600 } }, audio: false });
      streamRef.current = stream; setCameraOpen(true); requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
    } catch { setError("Não foi possível abrir a câmera. Use Selecionar foto ou confira a permissão do navegador."); }
  }
  function closeCamera() { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraOpen(false); }
  function capture() {
    const video = videoRef.current; const input = inputRef.current; if (!video || !input || !video.videoWidth) return;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight; const context = canvas.getContext("2d"); if (!context) return; context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (!blob) return; const file = new File([blob], `foto-clinica-${Date.now()}.jpg`, { type: "image/jpeg" }); const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(file)); closeCamera(); }, "image/jpeg", 0.9);
  }
  function selectFile(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(file)); }
  const guides = <><span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/70" /><span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/70" /><span className="pointer-events-none absolute inset-[12%] rounded-[28%] border-2 border-dashed border-white/75" /></>;
  return <div className="grid gap-3 sm:col-span-2 lg:col-span-3">
    <input ref={inputRef} className="sr-only" id="clinical-photo-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} required />
    <div className="flex flex-wrap gap-2"><button type="button" className="secondary-button" onClick={openCamera}><Camera size={17} /> Usar câmera guiada</button><label className="secondary-button cursor-pointer" htmlFor="clinical-photo-file"><ImagePlus size={17} /> Selecionar foto</label></div>
    {references.length > 0 && <div className="grid gap-2 sm:grid-cols-[1fr_180px]"><select className="field" value={referenceId} onChange={(event) => setReferenceId(event.target.value)}><option value="">Sem sobreposição de referência</option>{references.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><label className="text-xs font-bold text-muted">Opacidade da referência<input className="mt-2 w-full accent-brand" type="range" min="10" max="75" value={opacity} disabled={!reference} onChange={(event) => setOpacity(Number(event.target.value))} /></label></div>}
    {preview && <div className="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl bg-slate-950 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${preview})` }}>{reference && <div className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${reference.src})`, opacity: opacity / 100 }} />}{guides}</div>}
    {error && <p className="text-sm font-bold text-red-700" role="alert">{error}</p>}
    {cameraOpen && <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Câmera clínica guiada"><div className="flex items-center justify-between p-3 text-white"><div><p className="font-extrabold">Alinhe a região fotografada</p><p className="text-xs text-white/70">Repita distância, posição e iluminação da referência.</p></div><button type="button" className="rounded-full bg-white/15 p-2" onClick={closeCamera} aria-label="Fechar câmera"><X /></button></div><div className="relative flex-1 overflow-hidden"><video ref={videoRef} className="h-full w-full object-contain" playsInline muted />{reference && <div className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${reference.src})`, opacity: opacity / 100 }} />}{guides}</div><div className="flex justify-center p-5"><button type="button" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/25 text-white" onClick={capture} aria-label="Fotografar"><Camera size={34} /></button></div></div>}
  </div>;
}
