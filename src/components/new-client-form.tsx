"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/actions/app";
import { ActionForm } from "@/components/action-form";

export function NewClientForm({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  return (
    <section>
      <button type="button" className="primary-button" aria-expanded={open} aria-controls="new-client-form" onClick={() => setOpen(!open)}>
        {open ? "Fechar cadastro" : "+ Novo Cliente"}
      </button>
      <div id="new-client-form" hidden={!open} className="mt-4">
        <ActionForm action={createClient} successMessage="Cliente cadastrado com sucesso." onSuccess={() => { setOpen(false); setFormVersion((version) => version + 1); }} className="panel grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div key={formVersion} className="contents">{children}</div>
        </ActionForm>
      </div>
    </section>
  );
}
