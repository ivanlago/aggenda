"use client";

import { useId, useState, type ReactNode } from "react";

export function NewAppointmentToggle({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const panelId = useId();

  return <div id="novo-agendamento" className="mt-5 border-t pt-5">
    <button type="button" className="primary-button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)}>+ Novo agendamento</button>
    <div id={panelId} hidden={!expanded} className="mt-5">
      <h2 className="text-2xl font-extrabold">Novo agendamento</h2>
      {children}
    </div>
  </div>;
}
