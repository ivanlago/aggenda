"use client";

import { useState } from "react";

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

export function normalizeBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits.slice(2);
  return digits.slice(0, 11);
}

export function formatBrazilianPhone(value: string) {
  const digits = normalizeBrazilianPhone(value);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) return `(${area}) ${number}`;
  const split = number.length > 8 ? 5 : 4;
  return `(${area}) ${number.slice(0, split)}-${number.slice(split)}`;
}

export function PhoneInput({ name, defaultValue, value, onValueChange, className = "field", placeholder = "(71) 99999-9999", ...props }: PhoneInputProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => formatBrazilianPhone(defaultValue ?? ""));
  const displayValue = controlled ? formatBrazilianPhone(value) : internalValue;
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
        const formatted = formatBrazilianPhone(event.target.value);
        if (!controlled) setInternalValue(formatted);
        onValueChange?.(normalizeBrazilianPhone(formatted));
      }}
    />
  </>;
}
