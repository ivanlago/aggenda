"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { PosCatalog } from "@/components/pos-catalog";
import { registerRetailSale } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";
import { PhoneInput } from "@/components/phone-input";
import { PosPackageNotice } from "@/components/pos-package-notice";
import type { PosPackageBalance } from "@/lib/pos-package-balances";

type Variant = { id: string; label: string; barcode: string | null; priceInCents: number; stock: number; kind?: "product" | "service" | "package"; unavailableReason?: string };
type Client = { id: string; name: string; email: string | null; phone: string | null };
type CartItem = { variantId: string; quantity: number; discountInCents: number };
type Payment = { id: number; method: "cash" | "credit_card" | "debit_card" | "pix" | "bank_transfer" | "boleto" | "other"; amount: string; otherPaymentMethod?: string };

const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RetailSaleForm({ variants: productVariants, offerings = [], clients, canDiscount, attendanceId, initialClientId, initialCart = [], packageBalances = [], timezone, quoteId }: { variants: Variant[]; offerings?: Variant[]; clients: Client[]; canDiscount: boolean; attendanceId?: string; initialClientId?: string; initialCart?: CartItem[]; packageBalances?: PosPackageBalance[]; timezone?: string; quoteId?: string }) {
  const variants = useMemo(() => [...productVariants, ...offerings], [productVariants, offerings]);
  const [cart, setCart] = useState<CartItem[]>(initialCart);
  const [payments, setPayments] = useState<Payment[]>([{ id: 1, method: "cash", amount: initialCart.length ? (initialCart.reduce((total, item) => total + (variants.find((variant) => variant.id === item.variantId)?.priceInCents ?? 0) * item.quantity - item.discountInCents, 0) / 100).toFixed(2).replace(".", ",") : "" }]);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [receiptEmail, setReceiptEmail] = useState(clients.find((client) => client.id === initialClientId)?.email ?? "");
  const [receiptPhone, setReceiptPhone] = useState(clients.find((client) => client.id === initialClientId)?.phone ?? "");
  const [sendReceiptWhatsapp, setSendReceiptWhatsapp] = useState(false);
  const [sendReceiptEmail, setSendReceiptEmail] = useState(false);
  const variantsById = useMemo(() => new Map(variants.map((item) => [item.id, item])), [variants]);
  const subtotal = cart.reduce((sum, item) => sum + (variantsById.get(item.variantId)?.priceInCents ?? 0) * item.quantity, 0);
  const discountInCents = cart.reduce((sum, item) => sum + item.discountInCents, 0);
  const total = Math.max(0, subtotal - discountInCents);
  const paymentsPayload = payments.map((payment) => ({ method: payment.method, amountInCents: Math.max(0, Math.round((Number(payment.amount.replace(",", ".")) || 0) * 100)), otherPaymentMethod: payment.otherPaymentMethod ?? "" }));
  const paidTotal = paymentsPayload.reduce((sum, payment) => sum + payment.amountInCents, 0);

  const addToCart = (variantId: string) => setCart((current) => {
    const variant = variantsById.get(variantId);
    if (!variant || variant.unavailableReason) return current;
    const existing = current.find((item) => item.variantId === variantId);
    if (existing) return current.map((item) => item.variantId === variantId ? { ...item, quantity: Math.min(variant.stock, item.quantity + 1) } : item);
    return [...current, { variantId, quantity: 1, discountInCents: 0 }];
  });
  const setQuantity = (variantId: string, quantity: number) => setCart((current) => current.map((item) => {
    if (item.variantId !== variantId) return item;
    const stock = variantsById.get(variantId)?.stock ?? 1;
    return { ...item, quantity: Math.max(1, Math.min(stock, quantity || 1)) };
  }));
  const removeFromCart = (variantId: string) => setCart((current) => current.filter((item) => item.variantId !== variantId));
  const setItemDiscount = (variantId: string, raw: string) => setCart((current) => current.map((item) => item.variantId === variantId ? { ...item, discountInCents: Math.min(item.quantity * (variantsById.get(variantId)?.priceInCents ?? 0), Math.max(0, Math.round((Number(raw.replace(",", ".")) || 0) * 100))) } : item));


  return (
    <ActionForm action={registerRetailSale} successMessage="Venda registrada com sucesso." onSuccess={() => { setCart([]); setPayments([{ id: Date.now(), method: "cash", amount: "" }]); }} className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr] xl:items-start">
      {attendanceId && <input type="hidden" name="attendanceId" value={attendanceId} />}
      {quoteId && initialClientId && <input type="hidden" name="clientId" value={initialClientId} />}
      <input type="hidden" name="items" value={JSON.stringify(cart)} />
      <input type="hidden" name="payments" value={JSON.stringify(paymentsPayload)} />
      {quoteId ? <div className="panel"><h2 className="font-extrabold">Converter orçamento em venda</h2><p className="mt-2 text-sm text-muted">Confira os itens e informe o pagamento para concluir a venda com os valores do orçamento.</p><input type="hidden" name="quoteId" value={quoteId} /></div> : <PosCatalog variants={variants} cart={cart} addToCart={addToCart} />}

      <aside className="panel form-stack xl:sticky xl:top-5">
        <PosPackageNotice balances={packageBalances.filter((balance) => balance.clientId === clientId)} timezone={timezone} />
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand"><ShoppingCart className="size-5" /></span><div><h2 className="text-lg font-extrabold">Carrinho</h2><p className="text-sm text-muted">{cart.length} {cart.length === 1 ? "item" : "itens"}</p></div></div>
        <div className="divide-y rounded-2xl border px-3">
          {cart.map((item) => {
            const variant = variantsById.get(item.variantId)!;
            return <div className="grid gap-2 py-3" key={item.variantId}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-extrabold">{variant.label}</p><p className="text-xs text-muted">{currency(variant.priceInCents)} cada{variant.barcode ? ` · cód. ${variant.barcode}` : " · sem código"}</p></div><button className="icon-button text-red-700" type="button" disabled={Boolean(quoteId)} aria-label={`Remover ${variant.label}`} onClick={() => removeFromCart(item.variantId)}><Trash2 className="size-4" /></button></div><div className="flex items-center justify-between gap-3"><div className="flex items-center rounded-xl border bg-white"><button className="grid size-9 place-items-center" type="button" disabled={Boolean(quoteId)} aria-label={`Diminuir ${variant.label}`} onClick={() => item.quantity === 1 ? removeFromCart(item.variantId) : setQuantity(item.variantId, item.quantity - 1)}><Minus className="size-3.5" /></button><input className="w-12 border-x bg-transparent text-center text-sm font-bold outline-none" type="number" min="1" max={variant.stock} disabled={Boolean(quoteId)} value={item.quantity} onChange={(event) => setQuantity(item.variantId, Number(event.target.value))} aria-label={`Quantidade de ${variant.label}`} /><button className="grid size-9 place-items-center" type="button" disabled={Boolean(quoteId) || item.quantity >= variant.stock} aria-label={`Aumentar ${variant.label}`} onClick={() => setQuantity(item.variantId, item.quantity + 1)}><Plus className="size-3.5" /></button></div><strong>{currency(variant.priceInCents * item.quantity - item.discountInCents)}</strong></div>{canDiscount && !quoteId && <label className="flex items-center justify-between gap-3 text-xs font-bold text-muted">Desconto deste item (R$)<input className="field w-28" inputMode="decimal" value={(item.discountInCents / 100).toFixed(2).replace(".", ",")} onChange={(event) => setItemDiscount(item.variantId, event.target.value)} /></label>}</div>;
          })}
          {cart.length === 0 && <p className="py-8 text-center text-sm text-muted">O carrinho está vazio.</p>}
        </div>
        <label className="grid gap-1 text-sm font-bold">{attendanceId ? "Cliente do atendimento" : "Cliente (opcional)"}<select className="field" name="clientId" disabled={Boolean(attendanceId) || Boolean(quoteId && initialClientId)} required={cart.some((item) => variantsById.get(item.variantId)?.kind !== undefined && variantsById.get(item.variantId)?.kind !== "product")} value={clientId} onChange={(event) => { const id = event.target.value; const client = clients.find((item) => item.id === id); setClientId(id); setReceiptEmail(client?.email ?? ""); setReceiptPhone(client?.phone ?? ""); }}><option value="">Venda sem cliente identificado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-bold">Pagamentos</legend>{payments.map((payment, index) => <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={payment.id}><select className="field" value={payment.method} onChange={(event) => setPayments((current) => current.map((item) => item.id === payment.id ? { ...item, method: event.target.value as Payment['method'], otherPaymentMethod: "" } : item))}><option value="cash">Espécie</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="pix">PIX</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outros</option></select><input className="field" inputMode="decimal" value={payment.amount} onChange={(event) => setPayments((current) => current.map((item) => item.id === payment.id ? { ...item, amount: event.target.value } : item))} placeholder="Valor (R$)" aria-label={`Valor do pagamento ${index + 1}`} /><button className="icon-button text-red-700" type="button" disabled={payments.length === 1} onClick={() => setPayments((current) => current.filter((item) => item.id !== payment.id))} aria-label={`Remover pagamento ${index + 1}`}><Trash2 className="size-4" /></button>{payment.method === "other" && <input className="field sm:col-span-2" required value={payment.otherPaymentMethod ?? ""} onChange={(event) => setPayments((current) => current.map((item) => item.id === payment.id ? { ...item, otherPaymentMethod: event.target.value } : item))} placeholder="Justifique a forma de pagamento" aria-label="Justificativa da forma de pagamento" />}</div>)}<div className="flex flex-wrap gap-2"><button className="secondary-button" type="button" onClick={() => setPayments((current) => [...current, { id: Date.now(), method: "pix", amount: "" }])}>Adicionar pagamento</button><button className="secondary-button" type="button" onClick={() => { const remaining = Math.max(0, total - paidTotal + (paymentsPayload.at(-1)?.amountInCents ?? 0)); setPayments((current) => current.map((item, index) => index === current.length - 1 ? { ...item, amount: (remaining / 100).toFixed(2).replace(".", ",") } : item)); }}>Preencher restante</button></div><p className={`text-xs font-bold ${paidTotal === total ? "text-emerald-700" : "text-amber-700"}`}>Informado {currency(paidTotal)} de {currency(total)}</p></fieldset>
        <div className="grid gap-2 rounded-2xl border p-3"><div className="flex flex-wrap items-center gap-4"><p className="text-sm font-extrabold">Enviar recibo</p><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="sendReceiptWhatsapp" checked={sendReceiptWhatsapp} onChange={(event) => setSendReceiptWhatsapp(event.target.checked)} /> WhatsApp</label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="sendReceiptEmail" checked={sendReceiptEmail} onChange={(event) => setSendReceiptEmail(event.target.checked)} /> E-mail</label></div>{sendReceiptWhatsapp ? <PhoneInput name="receiptPhone" value={receiptPhone} onValueChange={setReceiptPhone} placeholder="WhatsApp: (71) 99999-9999" /> : null}{sendReceiptEmail ? <input className="field" name="receiptEmail" type="email" value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value)} placeholder="E-mail do comprador" /> : null}<p className="text-xs text-muted">O recibo para impressora térmica será aberto ao concluir.</p></div>
        <div className="grid gap-1 rounded-2xl bg-brand/5 p-4 text-sm"><div className="flex justify-between text-muted"><span>Subtotal</span><span>{currency(subtotal)}</span></div><div className="flex justify-between text-muted"><span>Desconto</span><span>- {currency(Math.min(discountInCents, subtotal))}</span></div><div className="mt-2 flex items-end justify-between border-t pt-3"><strong>Total</strong><strong className="text-2xl text-brand">{currency(total)}</strong></div></div>
        <button className="primary-button justify-center" disabled={!cart.length || paidTotal !== total}>Concluir venda</button>
      </aside>
    </ActionForm>
  );
}
