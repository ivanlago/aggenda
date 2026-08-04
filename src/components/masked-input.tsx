"use client";

import { useState, type InputHTMLAttributes } from "react";

type Mask = "cpfCnpj" | "phone" | "postalCode";

const settings: Record<Mask, { maxDigits: number; maxLength: number; pattern: string; title: string }> = {
  cpfCnpj: {
    maxDigits: 14,
    maxLength: 18,
    pattern: "(?:[0-9]{3}\\.[0-9]{3}\\.[0-9]{3}-[0-9]{2}|[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2})",
    title: "Digite um CPF no formato 000.000.000-00 ou CNPJ no formato 00.000.000/0000-00.",
  },
  phone: {
    maxDigits: 13,
    maxLength: 19,
    pattern: "(?:\\+55 )?\\([0-9]{2}\\) [0-9]{4,5}-[0-9]{4}",
    title: "Digite um telefone com DDD, por exemplo (71) 99999-9999. O +55 é opcional.",
  },
  postalCode: {
    maxDigits: 8,
    maxLength: 9,
    pattern: "[0-9]{5}-[0-9]{3}",
    title: "Digite o CEP no formato 00000-000.",
  },
};

function formatCpfCnpj(digits: string) {
  if (digits.length <= 11) {
    return digits.replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits.replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(rawDigits: string) {
  const hasCountryCode = rawDigits.length > 11 && rawDigits.startsWith("55");
  const prefix = hasCountryCode ? "+55 " : "";
  const digits = hasCountryCode ? rawDigits.slice(2, 13) : rawDigits.slice(0, 11);
  if (!digits) return prefix;
  if (digits.length < 3) return `${prefix}(${digits}`;
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  const split = number.length > 8 ? 5 : 4;
  return `${prefix}(${ddd}) ${number.slice(0, split)}${number.length > split ? `-${number.slice(split)}` : ""}`;
}

function applyMask(value: string, mask: Mask) {
  const config = settings[mask];
  const digits = value.replace(/\D/g, "").slice(0, config.maxDigits);
  if (mask === "cpfCnpj") return formatCpfCnpj(digits);
  if (mask === "phone") return formatPhone(digits);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "pattern" | "maxLength" | "value" | "defaultValue"> & {
  mask: Mask;
};

export function MaskedInput({ mask, className, ...props }: Props) {
  const [value, setValue] = useState("");
  const config = settings[mask];
  return <input
    {...props}
    className={className}
    type="text"
    inputMode="numeric"
    autoComplete={props.autoComplete}
    value={value}
    maxLength={config.maxLength}
    pattern={config.pattern}
    title={config.title}
    onChange={(event) => setValue(applyMask(event.currentTarget.value, mask))}
  />;
}
