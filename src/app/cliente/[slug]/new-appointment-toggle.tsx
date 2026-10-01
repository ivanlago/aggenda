"use client";

import { useId, useState, type ReactNode } from "react";

export function NewAppointmentToggle({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return <div className="mt-5 border-t pt-5">
    <button type="button" className="primary-button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)}>+ Novo agendamento</button>
    <div id={panelId} hidden={!expanded} className="mt-5">
      <h2 className="text-2xl font-extrabold">Novo agendamento</h2>
      {children}
    </div>
  </div>;
}
