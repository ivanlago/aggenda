"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function HeaderShortcut({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const router = useRouter();
  return <Link href={href} className={className} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = new URL(href, window.location.origin);
    target.searchParams.set("inicio", crypto.randomUUID());
    router.push(`${target.pathname}${target.search}${target.hash}`);
  }}>{children}</Link>;
}
