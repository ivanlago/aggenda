"use client";

import { useState } from "react";

export function ClinicalPhotoTreatmentField({ treatments }: { treatments: string[] }) {
  const [selected, setSelected] = useState(treatments.length ? treatments[0] : "");
  const [creating, setCreating] = useState(!treatments.length);
  return <div className="grid min-w-0 content-start gap-4">
    <label className="grid gap-1.5 text-sm font-bold">Tratamento
      <select className="field h-12 font-normal" aria-label="Tratamento" value={creating ? "__new__" : selected} onChange={event => { setCreating(event.target.value === "__new__"); if (event.target.value !== "__new__") setSelected(event.target.value); }}>
        {treatments.map(name => <option key={name} value={name}>{name}</option>)}
        <option value="__new__">Novo tratamento…</option>
      </select>
    </label>
    {creating ? <label className="grid gap-1.5 text-sm font-bold">Nome do tratamento<input className="field h-12 font-normal" name="captureSession" placeholder="Ex.: tratamento facial" maxLength={120} required aria-label="Nome do novo tratamento" /></label> : <input type="hidden" name="captureSession" value={selected} />}
  </div>;
}
