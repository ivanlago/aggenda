"use client";

import { useId, useState, type ReactNode } from "react";

export function ServiceCreateToggle({ label, children }: { label: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <section className="panel min-w-0">
    <button type="button" className="primary-button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>+ Novo {label}</button>
    <div id={id} hidden={!expanded} className="mt-6 border-t pt-6">{children}</div>
  </section>;
}
