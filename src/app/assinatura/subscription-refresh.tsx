"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SubscriptionRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      router.refresh();
      attempts += 1;
      if (attempts >= 15) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [enabled, router]);
  return null;
}
