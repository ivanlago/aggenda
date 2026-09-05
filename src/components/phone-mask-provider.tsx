"use client";

import { useEffect } from "react";
import { formatBrazilianPhone } from "@/components/phone-input";

export function PhoneMaskProvider() {
  useEffect(() => {
    const mask = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.type !== "tel" && input.inputMode !== "tel") return;
      const formatted = formatBrazilianPhone(input.value);
      if (input.value !== formatted) input.value = formatted;
    };
    document.addEventListener("input", mask);
    return () => document.removeEventListener("input", mask);
  }, []);
  return null;
}
