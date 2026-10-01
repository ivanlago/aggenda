"use client";

import { useState } from "react";

export type AttendanceReturnOption = { id: string; name: string; dueDate: string | null };

export function AttendanceReturnOptions({ procedures }: { procedures: AttendanceReturnOption[] }) {
  return <fieldset className="mt-4 grid gap-4 rounded-2xl border p-4"><legend className="px-2 font-extrabold">Retornos sugeridos</legend><p className="text-sm text-muted">Ao concluir, confirme o prazo ou ajuste para este cliente. O retorno é um convite à avaliação.</p>{procedures.map((procedure) => <ReturnOption key={`${procedure.id}-${procedure.dueDate}`} procedure={procedure} />)}</fieldset>;
}

function ReturnOption({ procedure }: { procedure: AttendanceReturnOption }) {
  const [mode, setMode] = useState("default");
  return <div className="grid gap-2"><p className="text-sm font-bold">{procedure.name}</p><select className="field" name={`returnMode:${procedure.id}`} value={mode} aria-label={`Retorno de ${procedure.name}`} onChange={(event) => setMode(event.target.value)}><option value="default">{procedure.dueDate ? `Usar data sugerida: ${procedure.dueDate.split("-").reverse().join("/")}` : "Sem retorno padrão"}</option><option value="custom">Definir outra data</option><option value="disabled">Não lembrar este retorno</option></select>{mode === "custom" && <label className="grid gap-2 text-sm font-bold">Data de retorno<input className="field" name={`returnDate:${procedure.id}`} type="date" defaultValue={procedure.dueDate ?? ""} required /></label>}</div>;
}
