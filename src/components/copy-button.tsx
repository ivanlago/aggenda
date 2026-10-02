"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ value, label = "Copiar", iconOnly = false }: { value: string; label?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  return <button className={iconOnly ? "icon-button shrink-0" : "secondary-button"} aria-label={copied ? "Copiado" : label} title={copied ? "Copiado" : label} type="button" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>{iconOnly ? (copied ? <Check className="size-4" /> : <Copy className="size-4" />) : copied ? "Copiado" : label}</button>;
}
