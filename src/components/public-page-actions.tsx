"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function PublicPageActions({ slug }: { slug: string }) {
  const href = `/agendar/${encodeURIComponent(slug)}`;
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copyLink() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    timer.current = setTimeout(() => setStatus("idle"), 2500);
  }

  const copyLabel = status === "copied" ? "Link copiado" : "Copiar link da página pública";
  return <div className="min-w-0">
    <div className="flex items-stretch gap-2">
      <Link className="secondary-button min-w-0 flex-1 justify-start gap-2" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="size-4 shrink-0" /><span>Ver página pública</span></Link>
      <button type="button" className="secondary-button shrink-0 px-3" onClick={copyLink} aria-label={copyLabel} title={copyLabel}>{status === "copied" ? <Check aria-hidden="true" className="size-4 text-emerald-600" /> : <Copy aria-hidden="true" className="size-4" />}</button>
    </div>
    <p role="status" aria-live="polite" className={`text-xs ${status === "error" ? "text-red-600" : "text-brand"}${status === "idle" ? " sr-only" : " mt-2"}`}>{status === "copied" ? "Link copiado" : status === "error" ? "Não foi possível copiar. Tente novamente." : ""}</p>
  </div>;
}
