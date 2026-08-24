"use client";

import { Printer } from "lucide-react";

export function PrintReceiptButton() {
  return <button className="print:hidden rounded-lg bg-black px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}><Printer className="mr-2 inline size-4" /> Imprimir</button>;
}
