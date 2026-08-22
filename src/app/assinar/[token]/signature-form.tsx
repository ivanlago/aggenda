"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { signElectronicDocument } from "@/actions/electronic-documents";
import { AnamnesisResponseFields } from "@/components/anamnesis-response-form";
import type { AnamnesisField } from "@/lib/anamnesis";

const initialState = { status: "idle", message: "" };

export function SignatureForm({ token, responseSchema, initialCode = "" }: { token: string; responseSchema?: AnamnesisField[] | null; initialCode?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signatureData, setSignatureData] = useState("");
  const [state, action, pending] = useActionState(signElectronicDocument, initialState);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.clientWidth * scale; canvas.height = canvas.clientHeight * scale;
    const context = canvas.getContext("2d");
    context?.scale(scale, scale);
    if (context) { context.lineWidth = 2; context.lineCap = "round"; context.strokeStyle = "#172018"; }
  }, []);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d"); const p = point(event); context?.beginPath(); context?.moveTo(p.x, p.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const p = point(event); const context = event.currentTarget.getContext("2d"); context?.lineTo(p.x, p.y); context?.stroke(); };
  const finish = () => { drawing.current = false; if (canvasRef.current) setSignatureData(canvasRef.current.toDataURL("image/png")); };
  const clear = () => { const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height); setSignatureData(""); };

  if (state.status === "success") return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><p className="font-extrabold">{state.message}</p><a className="primary-button mt-4 inline-flex" href={`/api/public/documents/${token}/pdf`}>Baixar minha via em PDF</a></div>;
  return <form action={action} className="mt-7 grid gap-4">
    <input type="hidden" name="token" value={token} /><input type="hidden" name="signatureData" value={signatureData} />
    {responseSchema?.length ? <AnamnesisResponseFields schema={responseSchema} /> : null}
    <label className="grid gap-2 text-sm font-bold">Código de confirmação<input className="field" name="verificationCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" defaultValue={initialCode} /></label>
    <div><p className="mb-2 text-sm font-bold">Assine no quadro abaixo</p><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} className="h-40 w-full touch-none rounded-2xl border bg-white" aria-label="Área para desenhar a assinatura" /><button className="mt-2 text-sm font-bold text-brand underline" type="button" onClick={clear}>Limpar assinatura</button></div>
    <label className="flex items-start gap-3 rounded-2xl border p-4 text-sm"><input className="mt-1" type="checkbox" name="accepted" required /><span>Declaro que li, compreendi e concordo com o conteúdo integral deste documento e confirmo ser o signatário identificado.</span></label>
    {state.status === "error" && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{state.message}</p>}
    <button className="primary-button" disabled={pending || !signatureData}>{pending ? "Registrando assinatura…" : "Assinar documento"}</button>
  </form>;
}
