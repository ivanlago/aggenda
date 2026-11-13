"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BookingPaymentDeadline({ expiresAt, timezone }: { expiresAt: string; timezone: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), Math.max(100, new Date(expiresAt).getTime() - Date.now() + 100));
    return () => clearTimeout(timer);
  }, [expiresAt, router]);
  return <p className="my-2 text-sm font-bold text-brand">Pague até {new Date(expiresAt).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" })} para confirmar o horário.</p>;
}
