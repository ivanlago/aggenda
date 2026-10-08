"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export function CommercialConversationBell({ initialCount, organizationId, today }: { initialCount: number | null; organizationId: string; today: string }) {
  const [count, setCount] = useState(initialCount);
  useEffect(() => {
    if (initialCount === null) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const response = await fetch("/api/crm/conversations/open-count", { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
        const result = await response.json();
        if (result.organizationId === organizationId && (result.count === null || (Number.isInteger(result.count) && result.count >= 0))) setCount(result.count);
      } catch { /* Keep the last known count when offline. */ }
      finally { pending = false; }
    }
    const timer = window.setInterval(refresh, 45000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [initialCount, organizationId]);
  if (count === null) return null;
  const href = `/crescimento?tab=conversas&conversationStatus=open&conversationFrom=2000-01-01&conversationTo=${today}`;
  return <Link href={href} aria-label={`Conversas comerciais: ${count} em aberto`} title={`${count} conversa(s) comercial(is) em aberto`} className="relative grid size-10 shrink-0 place-items-center rounded-lg transition hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-brand">
    <Image src="/header/bell.svg" width={14.6667} height={18.3333} alt="" unoptimized />
    {count > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#ba1a1a] px-1 text-[10px] font-extrabold leading-5 text-white ring-2 ring-background" aria-hidden="true">{count}</span>}
  </Link>;
}
