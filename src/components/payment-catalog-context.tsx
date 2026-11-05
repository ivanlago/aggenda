"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import type { PaymentCatalogMethod, PaymentCatalogAccount } from "@/lib/payment-catalog-policy";

const CatalogContext = createContext<{ methods: PaymentCatalogMethod[]; accounts: PaymentCatalogAccount[] }>({ methods: [], accounts: [] });
export const usePaymentCatalog = () => useContext(CatalogContext);
export function PaymentCatalogProvider({ catalog, children }: { catalog: { methods: PaymentCatalogMethod[]; accounts: PaymentCatalogAccount[] }; children: ReactNode }) {
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function PaymentMethodFields({ methodName = "paymentMethod", accountLabel = "Conta de pagamento", required = true, provider = "manual", initialMethodId = "", initialAccountId = "" }: { methodName?: string; accountLabel?: string; required?: boolean; provider?: string; initialMethodId?: string; initialAccountId?: string }) {
  const { methods, accounts } = usePaymentCatalog();
  const choices = methods.filter(method => method.provider === provider);
  const [methodId, setMethodId] = useState(initialMethodId);
  const [accountId, setAccountId] = useState(initialAccountId);
  const selected = choices.find(method => method.id === methodId);
  return <>
    <label className="grid min-w-0 gap-2 text-sm font-bold">Forma de pagamento{required ? " *" : ""}<select className="field" name={methodName} required={required} value={methodId} onChange={event => { const method = choices.find(item => item.id === event.target.value); setMethodId(event.target.value); setAccountId(method?.defaultAccountId ?? ""); }}><option value="">Selecione</option>{choices.map(method => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
    <label className="grid min-w-0 gap-2 text-sm font-bold">{accountLabel}{required ? " *" : ""}<select className="field" name="accountId" required={required} value={accountId || selected?.defaultAccountId || ""} onChange={event => setAccountId(event.target.value)}><option value="">Selecione</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
    {!choices.length && <p className="col-span-full text-sm text-amber-800">Cadastre uma opção ativa e compatível em <Link className="font-bold underline" href="/financeiro/formas-de-pagamento">Formas de Pagamento</Link>.</p>}
    {!accounts.length && <p className="col-span-full text-sm text-amber-800">Cadastre uma conta ativa nos cadastros financeiros.</p>}
  </>;
}
