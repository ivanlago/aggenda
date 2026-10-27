"use client";

import { useState } from "react";

export function ClinicalPhotoTreatmentField({ treatments }: { treatments: string[] }) {
  const [selected, setSelected] = useState(treatments.length ? treatments[0] : "");
  const [creating, setCreating] = useState(!treatments.length);
  return <div className="grid gap-2">
    <label className="text-xs font-bold">Tratamento
      <select className="field mt-1" aria-label="Tratamento" value={creating ? "__new__" : selected} onChange={event => { setCreating(event.target.value === "__new__"); if (event.target.value !== "__new__") setSelected(event.target.value); }}>
        {treatments.map(name => <option key={name} value={name}>{name}</option>)}
        <option value="__new__">Novo tratamento…</option>
      </select>
    </label>
    {creating ? <input className="field" name="captureSession" placeholder="Nome do tratamento" maxLength={120} required aria-label="Nome do novo tratamento" /> : <input type="hidden" name="captureSession" value={selected} />}
  </div>;
}
