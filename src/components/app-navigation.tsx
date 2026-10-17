"use client";

import { useId, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

export function AppNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="min-w-0 lg:contents">
    <button type="button" className="secondary-button mt-4 w-full justify-between lg:hidden" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      Menu de navegação {open ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
    </button>
    <nav id={id} aria-label="Navegação principal" className={`app-menu-scrollbar mt-3 min-w-0 gap-1 lg:mt-7 lg:grid lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-y-auto lg:pb-4 ${open ? "grid" : "hidden"}`} onClick={event => {
      if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
    }} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); document.querySelector<HTMLButtonElement>(`button[aria-controls="${id}"]`)?.focus(); } }}>
      {children}
    </nav>
  </div>;
}
