"use client";

import { useEffect } from "react";
import { formatBrazilianPhoneInput } from "@/lib/phone";

export function PhoneMaskProvider() {
  useEffect(() => {
    const mask = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.type !== "tel" && input.inputMode !== "tel") return;
      const formatted = formatBrazilianPhoneInput(input.value);
      if (input.value !== formatted) input.value = formatted;
    };
    document.addEventListener("input", mask);
    return () => document.removeEventListener("input", mask);
  }, []);
  return null;
}
