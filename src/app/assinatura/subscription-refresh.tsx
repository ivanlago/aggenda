"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SubscriptionRefresh({
  enabled,
  confirmed,
}: {
  enabled: boolean;
  confirmed: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (confirmed) {
      const redirectTimer = window.setTimeout(() => {
        router.replace("/dashboard?compra=sucesso");
      }, 2500);
      return () => window.clearTimeout(redirectTimer);
    }
    if (!enabled) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      router.refresh();
      attempts += 1;
      if (attempts >= 15) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [confirmed, enabled, router]);
  return null;
}
