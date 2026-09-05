"use client";

import { useState } from "react";
import { formatBrazilianPhoneInput, normalizeBrazilianPhone } from "@/lib/phone";

type PhoneInputProps = {
  name: string;
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  "aria-label"?: string;
};

export function PhoneInput({ name, defaultValue, value, onValueChange, className = "field", placeholder = "(71) 99999-9999", ...props }: PhoneInputProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => formatBrazilianPhoneInput(defaultValue ?? ""));
  const displayValue = controlled ? formatBrazilianPhoneInput(value) : internalValue;
  const normalizedValue = normalizeBrazilianPhone(displayValue);

  return <>
    <input type="hidden" name={name} value={normalizedValue} disabled={props.disabled} />
    <input
      {...props}
      className={className}
      type="tel"
      inputMode="tel"
      maxLength={15}
      value={displayValue}
      placeholder={placeholder}
      onChange={(event) => {
        const formatted = formatBrazilianPhoneInput(event.target.value);
        if (!controlled) setInternalValue(formatted);
        onValueChange?.(normalizeBrazilianPhone(formatted));
      }}
    />
  </>;
}
