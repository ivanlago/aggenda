"use client";

import Konva from "konva";
import { Arrow, Circle, Ellipse, Image as KonvaImage, Layer, Line, Stage, Text } from "react-konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CircleDot, Eraser, Minus, MousePointer2, Pencil, Redo2, Save, Trash2, Type, Undo2, X } from "lucide-react";

type Tool = "select" | "pencil" | "line" | "arrow" | "ellipse" | "point" | "text";
export type SimulationShape = { id: string; type: Exclude<Tool, "select">; color: string; width: number; points?: number[]; x?: number; y?: number; radiusX?: number; radiusY?: number; text?: string };
const tools: Array<{ id: Tool; label: string; icon: typeof Pencil }> = [
  { id: "select", label: "Selecionar", icon: MousePointer2 }, { id: "pencil", label: "Pincel", icon: Pencil },
  { id: "point", label: "Ponto", icon: CircleDot }, { id: "line", label: "Linha", icon: Minus },
  { id: "arrow", label: "Seta", icon: ArrowUpRight }, { id: "ellipse", label: "Área", icon: Eraser }, { id: "text", label: "Texto", icon: Type },
];

export function ClinicalSimulationEditor({ source, initialAnnotations, onClose, onSave, saving }: { source: string; initialAnnotations?: Array<Record<string, unknown>>; onClose: () => void; onSave: (blob: Blob, annotations: SimulationShape[]) => void; saving: boolean }) {
  const stageRef = useRef<Konva.Stage>(null); const wrapRef = useRef<HTMLDivElement>(null); const drawingId = useRef<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null); const [stageWidth, setStageWidth] = useState(900);
  const [tool, setTool] = useState<Tool>("pencil"); const [color, setColor] = useState("#ef4444"); const [strokeWidth, setStrokeWidth] = useState(4);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [shapes, setShapes] = useState<SimulationShape[]>(() => (initialAnnotations ?? []) as SimulationShape[]);
  const [history, setHistory] = useState<SimulationShape[][]>([]); const [future, setFuture] = useState<SimulationShape[][]>([]);
  useEffect(() => { const loaded = new window.Image(); loaded.crossOrigin = "anonymous"; loaded.onload = () => setImage(loaded); loaded.src = source; }, [source]);
  useEffect(() => { const element = wrapRef.current; if (!element) return; const observer = new ResizeObserver(([entry]) => setStageWidth(Math.min(1000, Math.max(300, entry.contentRect.width)))); observer.observe(element); return () => observer.disconnect(); }, []);
  const stageHeight = useMemo(() => image ? Math.min(720, Math.max(360, stageWidth * image.height / image.width)) : 600, [image, stageWidth]);
  function checkpoint() { setHistory((items) => [...items.slice(-29), structuredClone(shapes)]); setFuture([]); }
  function pointer() { const position = stageRef.current?.getPointerPosition(); return position ? { x: position.x / stageWidth, y: position.y / stageHeight } : null; }
  function startDrawing() {
    const position = pointer(); if (!position || tool === "select") return; checkpoint(); const id = crypto.randomUUID(); drawingId.current = id;
    if (tool === "text") { const value = window.prompt("Digite a anotação:")?.trim(); if (value) setShapes((items) => [...items, { id, type: "text", color, width: strokeWidth, x: position.x, y: position.y, text: value }]); drawingId.current = null; return; }
    if (tool === "point") { setShapes((items) => [...items, { id, type: "point", color, width: strokeWidth, x: position.x, y: position.y }]); drawingId.current = null; return; }
    if (tool === "ellipse") { setShapes((items) => [...items, { id, type: "ellipse", color, width: strokeWidth, x: position.x, y: position.y, radiusX: 0, radiusY: 0 }]); return; }
    setShapes((items) => [...items, { id, type: tool, color, width: strokeWidth, points: [position.x, position.y, position.x, position.y] }]);
  }
  function continueDrawing() { const position = pointer(); const id = drawingId.current; if (!position || !id) return; setShapes((items) => items.map((shape) => { if (shape.id !== id) return shape; if (shape.type === "pencil") return { ...shape, points: [...(shape.points ?? []), position.x, position.y] }; if (shape.type === "ellipse") return { ...shape, radiusX: Math.abs(position.x - (shape.x ?? 0)), radiusY: Math.abs(position.y - (shape.y ?? 0)) }; return { ...shape, points: [shape.points?.[0] ?? position.x, shape.points?.[1] ?? position.y, position.x, position.y] }; })); }
  function moveShape(id: string, x: number, y: number) { checkpoint(); setShapes((items) => items.map((shape) => shape.id === id ? { ...shape, x: x / stageWidth, y: y / stageHeight } : shape)); }
  function undo() { const previous = history.at(-1); if (!previous) return; setFuture((items) => [structuredClone(shapes), ...items]); setShapes(previous); setHistory((items) => items.slice(0, -1)); }
  function redo() { const next = future[0]; if (!next) return; setHistory((items) => [...items, structuredClone(shapes)]); setShapes(next); setFuture((items) => items.slice(1)); }
  function removeSelected() { if (!selectedId) return; checkpoint(); setShapes((items) => items.filter((shape) => shape.id !== selectedId)); setSelectedId(null); }
  async function save() { const stage = stageRef.current; if (!stage) return; const dataUrl = stage.toDataURL({ mimeType: "image/webp", quality: 0.9, pixelRatio: 2 }); const blob = await (await fetch(dataUrl)).blob(); onSave(blob, shapes); }
  function common(shape: SimulationShape) { return { draggable: tool === "select", onClick: () => tool === "select" && setSelectedId(shape.id), onTap: () => tool === "select" && setSelectedId(shape.id), onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => moveShape(shape.id, event.target.x(), event.target.y()), shadowColor: selectedId === shape.id ? "#ffffff" : undefined, shadowBlur: selectedId === shape.id ? 8 : 0 }; }
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95" role="dialog" aria-modal="true" aria-label="Simulador de procedimentos">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-slate-950 px-4 py-3 text-white"><div><h3 className="font-extrabold">Simulador de procedimentos</h3><p className="text-xs text-slate-300">Simulação visual ilustrativa, sem garantia de resultado clínico.</p></div><div className="flex gap-2"><button className="secondary-button border-slate-600 bg-transparent text-white" type="button" onClick={onClose}><X size={17} /> Fechar</button><button className="primary-button" type="button" disabled={saving || !image} onClick={save}><Save size={17} /> {saving ? "Salvando…" : "Salvar simulação"}</button></div></div>
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row"><aside className="flex shrink-0 flex-wrap content-start gap-2 overflow-auto border-b border-white/15 bg-slate-900 p-3 text-white lg:w-52 lg:flex-col lg:border-b-0 lg:border-r">
      {tools.map((item) => <button key={item.id} type="button" title={item.label} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${tool === item.id ? "bg-emerald-600" : "bg-white/5 hover:bg-white/10"}`} onClick={() => { setTool(item.id); setSelectedId(null); }}><item.icon size={18} /><span>{item.label}</span></button>)}
      <label className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm font-bold">Cor <input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label className="rounded-xl bg-white/5 px-3 py-2 text-xs font-bold">Espessura<input className="mt-1 w-full accent-emerald-500" type="range" min="2" max="14" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} /></label>
      <div className="flex gap-2"><button type="button" className="rounded-xl bg-white/5 p-2 disabled:opacity-30" disabled={!history.length} onClick={undo} title="Desfazer"><Undo2 size={18} /></button><button type="button" className="rounded-xl bg-white/5 p-2 disabled:opacity-30" disabled={!future.length} onClick={redo} title="Refazer"><Redo2 size={18} /></button><button type="button" className="rounded-xl bg-red-500/20 p-2 text-red-300 disabled:opacity-30" disabled={!selectedId} onClick={removeSelected} title="Excluir selecionado"><Trash2 size={18} /></button></div>
    </aside><main className="flex-1 overflow-auto p-3 lg:p-6"><div ref={wrapRef} className="mx-auto max-w-[1000px] overflow-hidden rounded-xl bg-white shadow-2xl">
      <Stage ref={stageRef} width={stageWidth} height={stageHeight} onMouseDown={startDrawing} onTouchStart={startDrawing} onMouseMove={continueDrawing} onTouchMove={continueDrawing} onMouseUp={() => { drawingId.current = null; }} onTouchEnd={() => { drawingId.current = null; }}><Layer>
        {image && <KonvaImage image={image} width={stageWidth} height={stageHeight} listening={false} />}
        {shapes.map((shape) => { const stroke = shape.color; const width = shape.width;
          if (shape.type === "point") return <Circle key={shape.id} {...common(shape)} x={(shape.x ?? 0) * stageWidth} y={(shape.y ?? 0) * stageHeight} radius={Math.max(6, width * 1.8)} fill={stroke} stroke="white" strokeWidth={1} />;
          if (shape.type === "text") return <Text key={shape.id} {...common(shape)} x={(shape.x ?? 0) * stageWidth} y={(shape.y ?? 0) * stageHeight} text={shape.text ?? ""} fill={stroke} fontSize={Math.max(16, width * 5)} fontStyle="bold" />;
          if (shape.type === "ellipse") return <Ellipse key={shape.id} {...common(shape)} x={(shape.x ?? 0) * stageWidth} y={(shape.y ?? 0) * stageHeight} radiusX={(shape.radiusX ?? 0) * stageWidth} radiusY={(shape.radiusY ?? 0) * stageHeight} stroke={stroke} strokeWidth={width} fill={`${stroke}28`} />;
          const points = (shape.points ?? []).map((value, index) => value * (index % 2 === 0 ? stageWidth : stageHeight));
          if (shape.type === "arrow") return <Arrow key={shape.id} {...common(shape)} points={points} stroke={stroke} fill={stroke} strokeWidth={width} pointerLength={12} pointerWidth={12} lineCap="round" />;
          return <Line key={shape.id} {...common(shape)} points={points} stroke={stroke} strokeWidth={width} lineCap="round" lineJoin="round" tension={shape.type === "pencil" ? 0.25 : 0} />;
        })}
      </Layer></Stage>
    </div></main></div>
  </div>;
}
