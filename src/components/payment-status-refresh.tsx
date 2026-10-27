"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PaymentStatusRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let checks = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (++checks > 30) { window.clearInterval(timer); return; }
      router.refresh();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [pending, router]);
  return null;
}
