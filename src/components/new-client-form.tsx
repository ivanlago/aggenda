"use client";
import { type ReactNode } from "react";
import { createClient } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";
export function NewClientForm({ children, clientLabel = "Cliente" }: { children: ReactNode; clientLabel?: string }) {
 return <ModalShell title={`Novo ${clientLabel.toLowerCase()}`} variant="new" wide closeOnSuccess><ActionForm action={createClient} successMessage={`${clientLabel} cadastrado com sucesso.`} className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</ActionForm></ModalShell>;
}
