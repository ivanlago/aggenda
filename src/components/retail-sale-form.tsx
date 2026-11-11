"use client";

import { organizationDate } from "@/lib/organization-time";
import { AsaasCardFees } from "@/components/asaas-card-fees";
import { PagBankInstallmentFields } from "@/components/pagbank-installment-fields";
import { hostedPaymentKindSupported, onlineInstallmentRules, onlineInstallmentTerms, type OnlineInstallmentRules } from "@/lib/payment-catalog-policy";
import { usePaymentCatalog } from "@/components/payment-catalog-context";
import { pendingItemsInCart } from "@/lib/attendance-pending-items";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { PosCatalog, type CatalogItem } from "@/components/pos-catalog";
import { registerRetailSale } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";
import Link from "next/link";
import { openCash } from "@/actions/financial-operations";
import type { getOpenPosCash } from "@/lib/pos-cash";
import { PhoneInput } from "@/components/phone-input";
import { ClientSearch } from "@/components/client-search";
import { OrderDiscountField } from "@/components/order-discount-field";
import { allocateOrderDiscount, type DiscountType } from "@/lib/order-discount";
import { PosPackageNotice } from "@/components/pos-package-notice";
import type { PosPackageBalance } from "@/lib/pos-package-balances";

import type { CommissionBeneficiaryOption } from "@/lib/commission-beneficiary";

type Variant = CatalogItem;
type Client = { id: string; name: string; email: string | null; phone: string | null };
type CartItem = { variantId: string; quantity: number; discountInCents: number };
type Payment = { id: number; method: string; amount: string; boletoCount?: string; boletoFirstDue?: string };

const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RetailSaleForm({ variants: productVariants, commissionChoices = [], defaultCommissionBeneficiary = "", offerings = [], clients, canDiscount, attendanceId, initialClientId, initialCart = [], pendingAttendanceItems = [], packageBalances = [], timezone = "America/Bahia", quoteId, paymentProviders = [], onlineInstallmentPolicy, canOverridePagBank = false, defaultPaymentProvider = "manual", initialItemType = "all", cashSession, operatorName }: { variants: Variant[]; commissionChoices?: CommissionBeneficiaryOption[]; defaultCommissionBeneficiary?: string; offerings?: Variant[]; clients: Client[]; canDiscount: boolean; attendanceId?: string; initialClientId?: string; initialCart?: CartItem[]; pendingAttendanceItems?: { id: string; catalogId: string; quantity: number }[]; packageBalances?: PosPackageBalance[]; timezone?: string; quoteId?: string; customPaymentMethods?: { id: string; name: string }[]; paymentProviders?: { id: string; name: string; environment: string }[]; onlineInstallmentPolicy?: OnlineInstallmentRules; canOverridePagBank?: boolean; defaultPaymentProvider?: string; initialItemType?: "all" | "product" | "service" | "package"; cashSession: Awaited<ReturnType<typeof getOpenPosCash>>; operatorName?: string }) {
  const { methods, accounts } = usePaymentCatalog();
  const manualMethods = methods.filter(method => accounts.some(account => account.id === method.defaultAccountId));
  const [withOnlinePayment, setWithOnlinePayment] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const onlineProvider = paymentProviders.find(provider => provider.id === selectedProvider) ?? paymentProviders.find(provider => provider.id === defaultPaymentProvider) ?? paymentProviders[0];
  const checkoutProvider = withOnlinePayment ? onlineProvider?.id ?? "manual" : "manual";
  const onlineMethods = manualMethods.filter(method => hostedPaymentKindSupported(method.kind, checkoutProvider));
  const onlinePayment = checkoutProvider !== "manual";
  const checkoutKeyRef = useRef<string | null>(null);
  const variants = useMemo(() => [...productVariants, ...offerings], [productVariants, offerings]);
  const [cart, setCart] = useState<CartItem[]>(initialCart);
  const [payments, setPayments] = useState<Payment[]>([{ id: 1, method: "", amount: initialCart.length ? (initialCart.reduce((total, item) => total + (variants.find((variant) => variant.id === item.variantId)?.priceInCents ?? 0) * item.quantity - item.discountInCents, 0) / 100).toFixed(2).replace(".", ",") : "" }]);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [receiptEmail, setReceiptEmail] = useState(clients.find((client) => client.id === initialClientId)?.email ?? "");
  const [receiptPhone, setReceiptPhone] = useState(clients.find((client) => client.id === initialClientId)?.phone ?? "");
  const [sendReceiptWhatsapp, setSendReceiptWhatsapp] = useState(false);
  const [sendReceiptEmail, setSendReceiptEmail] = useState(false);
  const variantsById = useMemo(() => new Map(variants.map((item) => [item.id, item])), [variants]);
  const [discountType, setDiscountType] = useState<DiscountType>("amount");
  const [discountValue, setDiscountValue] = useState("");
  let discountError = "";
  let discountedCart = cart;
  try {
    const shares = allocateOrderDiscount(cart.map((item) => (variantsById.get(item.variantId)?.priceInCents ?? 0) * item.quantity - item.discountInCents), discountType, canDiscount && !quoteId ? discountValue : "");
    discountedCart = cart.map((item, index) => ({ ...item, discountInCents: item.discountInCents + shares[index] }));
  } catch (error) { discountError = error instanceof Error ? error.message : "Desconto inválido."; }
  const [paymentDate] = useState(() => new Date());
  const boletoToday = organizationDate(paymentDate,timezone);
  const boletoTomorrow = organizationDate(new Date(paymentDate.getTime() + 86400000), timezone);
  const hasBoletoPlan = onlinePayment && checkoutProvider === "mercado_pago" && payments.some(payment => onlineMethods.some(method => method.id === payment.method && method.kind === "boleto") && Number(payment.boletoCount ?? 1) > 1);
  const requiresClient = hasBoletoPlan || cart.some((item) => variantsById.get(item.variantId)?.kind !== undefined && variantsById.get(item.variantId)?.kind !== "product");
  const subtotal = cart.reduce((sum, item) => sum + (variantsById.get(item.variantId)?.priceInCents ?? 0) * item.quantity, 0);
  const discountInCents = discountedCart.reduce((sum, item) => sum + item.discountInCents, 0);
  const total = Math.max(0, subtotal - discountInCents);
  const paymentsPayload = payments.map(payment => ({
    method: payment.method,
    ...(onlinePayment && checkoutProvider === "mercado_pago" && onlineMethods.some(method => method.id === payment.method && method.kind === "boleto") ? { boletoCount: Number(payment.boletoCount ?? 1), boletoFirstDue: Number(payment.boletoCount ?? 1) > 1 ? payment.boletoFirstDue || boletoTomorrow : boletoToday } : {}),
    amountInCents: Math.max(0, Math.round((Number(payment.amount.replace(",", ".")) || 0) * 100)),
  }));
  const cardPaymentAmount = Math.min(total, ...paymentsPayload.filter(payment => onlineMethods.some(method => method.id === payment.method && ["credit_card", "link"].includes(method.kind))).map(payment => payment.amountInCents));
  const mercadoPagoRules = checkoutProvider === "mercado_pago" && onlineMethods.some(method => payments.some(payment => payment.method === method.id) && ["credit_card", "link"].includes(method.kind))
    ? onlineInstallmentPolicy : undefined;
  const mercadoPagoMaximum = mercadoPagoRules ? onlineInstallmentTerms(mercadoPagoRules, cardPaymentAmount, "mercado_pago").maximum : 1;
  const [withCommission, setWithCommission] = useState(false);
  const [commissionBeneficiary, setCommissionBeneficiary] = useState(defaultCommissionBeneficiary);
  const selectedCommission = withCommission && commissionChoices.some(option => option.value === commissionBeneficiary) ? commissionBeneficiary : "";
  const cashError = cashSession ? "" : "Abra seu caixa antes de confirmar a venda.";
  const paidTotal = paymentsPayload.reduce((sum, payment) => sum + payment.amountInCents, 0);

  const addToCart = (variantId: string) => setCart((current) => {
    const variant = variantsById.get(variantId);
    if (!variant || variant.unavailableReason || variant.stock < 1) return current;
    const existing = current.find((item) => item.variantId === variantId);
    if (existing) return current.map((item) => item.variantId === variantId ? { ...item, quantity: Math.min(variant.stock, item.quantity + 1) } : item);
    return [...current, { variantId, quantity: 1, discountInCents: 0 }];
  });
  const setQuantity = (variantId: string, quantity: number) => setCart((current) => current.map((item) => {
    if (item.variantId !== variantId) return item;
    const stock = variantsById.get(variantId)?.stock ?? 1;
    const nextQuantity = Math.max(1, Math.min(stock, quantity || 1));
    return { ...item, quantity: nextQuantity, discountInCents: Math.min(item.discountInCents, nextQuantity * (variantsById.get(variantId)?.priceInCents ?? 0)) };
  }));
  const removeFromCart = (variantId: string) => setCart((current) => current.filter((item) => item.variantId !== variantId));
  const setItemDiscount = (variantId: string, raw: string) => setCart((current) => current.map((item) => item.variantId === variantId ? { ...item, discountInCents: Math.min(item.quantity * (variantsById.get(variantId)?.priceInCents ?? 0), Math.max(0, Math.round((Number(raw.replace(",", ".")) || 0) * 100))) } : item));


  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.55fr)_minmax(0,0.7fr)_minmax(0,0.75fr)] xl:items-start">
      <div className="grid min-w-0 gap-5 xl:self-stretch">
        <section className="panel grid min-w-0 content-start gap-4" aria-label="Cliente">
          <ClientSearch clients={clients} value={clientId} fixed={Boolean(attendanceId || (quoteId && initialClientId))} required={requiresClient} onChange={(id) => { const client = clients.find((item) => item.id === id); setClientId(id); setReceiptEmail(client?.email ?? ""); setReceiptPhone(client?.phone ?? ""); }} />
          <PosPackageNotice balances={packageBalances.filter((balance) => balance.clientId === clientId)} timezone={timezone} />
        </section>
        <section className="panel grid min-w-0 content-start gap-3" aria-label="Comissão">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={withCommission} onChange={event => setWithCommission(event.target.checked)} />
            Venda com comissão?
          </label>
          {withCommission && (commissionChoices.length ? <label className="grid gap-2 text-sm font-bold">
            Beneficiário da comissão
            <select className="field" value={selectedCommission} onChange={event => setCommissionBeneficiary(event.target.value)}>
              <option value="">Selecione</option>
              {commissionChoices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label> : <p className="text-sm text-muted">Nenhum beneficiário com regra de comissão de venda ativa.</p>)}
        </section>
      </div>
      <section className="panel grid min-w-0 content-start gap-3 xl:self-stretch" aria-label="Caixa">
        <h2 className="text-lg font-extrabold">Caixa</h2>
        {operatorName && <p className="text-sm text-muted">Operador: {operatorName}</p>}
        {cashSession ? <>
          <p className="text-sm font-bold text-brand">Caixa aberto às {new Date(cashSession.openedAt).toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}</p>
          <Link className="secondary-button w-fit" href={"/financeiro/meus-caixas?caixa=" + cashSession.id}>Resumo e movimentos</Link>
        </> : <>
          <p className="text-sm text-muted">Abra seu caixa para registrar vendas.</p>
          <ModalShell title="Abrir caixa" variant="new" secondary closeOnSuccess compact>
            <ActionForm action={openCash} successMessage="Caixa aberto." className="grid gap-4">
              <label className="grid gap-2 text-sm font-bold">Saldo inicial em dinheiro (R$)<input className="field" name="openingBalance" inputMode="decimal" placeholder="0,00" /></label>
              <button className="primary-button w-fit" type="submit">Abrir caixa</button>
            </ActionForm>
          </ModalShell>
          <Link className="text-sm font-bold text-brand" href="/financeiro/meus-caixas">Ver histórico de caixas</Link>
        </>}
      </section>
      <section className="panel grid min-w-0 content-start gap-3 xl:self-stretch" aria-label="Informações da venda">
        <h2 className="text-lg font-extrabold">Informações da venda</h2>
        <p className="text-sm text-muted">{cart.length} {cart.length === 1 ? "item" : "itens"} no carrinho</p>
        <p className="text-xl font-extrabold text-brand">Total: {currency(total)}</p>
        {requiresClient && !clientId && <p className="text-sm text-muted">Identifique o cliente para vender serviços ou pacotes.</p>}
        {withCommission && commissionChoices.length > 0 && !selectedCommission && <p className="text-sm text-muted">Selecione o beneficiário da comissão.</p>}
        <ModalShell title="Pagamento da venda" triggerLabel="Concluir venda" variant="payment" closeOnSuccess wide triggerDisabled={!cart.length || Boolean(discountError) || (requiresClient && !clientId) || (withCommission && !selectedCommission)}>
          <ActionForm action={async data => { if (onlinePayment) { checkoutKeyRef.current ??= crypto.randomUUID(); data.set("checkoutKey", checkoutKeyRef.current); } return registerRetailSale(data); }} successMessage="Venda registrada com sucesso." onSuccess={() => {
            checkoutKeyRef.current = null;
            setCart([]);
            setDiscountValue("");
            setPayments([{ id: Date.now(), method: "", amount: "" }]);
            setWithCommission(false);
            setCommissionBeneficiary(defaultCommissionBeneficiary);
          }} className="grid gap-4">
            {attendanceId && <input type="hidden" name="attendanceId" value={attendanceId} />}
            <input type="hidden" name="pendingAttendanceItemIds" value={JSON.stringify(pendingItemsInCart(pendingAttendanceItems, cart))} />
            <input type="hidden" name="checkoutProvider" value={checkoutProvider} />
            <input type="hidden" name="items" value={discountError ? "[]" : JSON.stringify(discountedCart)} />
            <input type="hidden" name="payments" value={JSON.stringify(paymentsPayload)} />
            <input type="hidden" name="clientId" value={clientId} />
            {quoteId && <input type="hidden" name="quoteId" value={quoteId} />}
            <input type="hidden" name="commissionBeneficiary" value={selectedCommission} />
            <input type="hidden" name="cashClosingId" value={cashSession?.id ?? ""} />
            <p className="text-lg font-extrabold">Total a pagar: {currency(total)}</p>
            <div className={`grid min-w-0 gap-4 ${onlinePayment ? "sm:grid-cols-2" : ""}`}>
              <label className="grid min-w-0 gap-2 text-sm font-bold">Recebimento<select className="field" value={onlinePayment ? "online" : "manual"} onChange={event => setWithOnlinePayment(event.target.value === "online")}><option value="manual">Registrar recebimento por maquineta</option><option value="online" disabled={!onlineProvider}>Emitir cobrança online</option></select></label>
              {onlinePayment && <label className="grid min-w-0 gap-2 text-sm font-bold">Provedor<select className="field" value={checkoutProvider} onChange={event => { setSelectedProvider(event.target.value); setPayments(current => current.map(payment => ({ ...payment, method: "" }))); }}>{paymentProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name}{provider.environment === "sandbox" ? " (testes)" : ""}</option>)}</select></label>}
            </div>
            {!attendanceId && !onlineProvider && <p className="text-sm text-muted">Para emitir cobranças online, conecte um provedor em <Link className="font-bold text-brand underline" href="/configuracoes?aba=payments">Provedores de pagamento</Link>.</p>}
            {onlinePayment && !onlineMethods.length && <p className="text-sm text-muted">Cadastre uma forma compatível com uma conta de destino ativa em <Link className="font-bold text-brand underline" href="/financeiro/formas-de-pagamento">Formas de pagamento</Link>.</p>}
            <fieldset className="grid min-w-0 gap-3"><legend className="mb-1 text-sm font-bold">Pagamentos</legend>
              {payments.map((payment, index) => <div className="grid min-w-0 gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={payment.id}>
                <label className="grid gap-1 text-sm font-bold">Forma de pagamento *<select className="field" required value={payment.method} onChange={event => setPayments(current => current.map(item => item.id === payment.id ? { ...item, method: event.target.value } : item))}><option value="">Selecione</option>{(onlinePayment ? onlineMethods : manualMethods).map(method => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
                <label className="grid gap-1 text-sm font-bold">Valor (R$) *<input className="field" required inputMode="decimal" value={payment.amount} onChange={event => setPayments(current => current.map(item => item.id === payment.id ? { ...item, amount: event.target.value } : item))} aria-label={`Valor do pagamento ${index + 1}`} /></label>
                <button className="icon-button self-end text-red-700" type="button" disabled={payments.length === 1} onClick={() => setPayments(current => current.filter(item => item.id !== payment.id))} aria-label={`Remover pagamento ${index + 1}`}><Trash2 className="size-4" /></button>
                {onlinePayment && checkoutProvider === "mercado_pago" && onlineMethods.some(method => method.id === payment.method && method.kind === "boleto") && <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Qtd de parcelas mensais<input className="field" type="number" min="1" max="60" required value={payment.boletoCount ?? "1"} onChange={event => setPayments(current => current.map(item => item.id === payment.id ? {...item,boletoCount:event.target.value} : item))} /></label>{Number(payment.boletoCount ?? 1) > 1 && <label className="grid gap-1 text-sm font-bold">Primeiro vencimento<input className="field" type="date" required disabled={Number(payment.boletoCount ?? 1) <= 1} min={boletoTomorrow} value={payment.boletoFirstDue || boletoTomorrow} onChange={event => setPayments(current => current.map(item => item.id === payment.id ? {...item,boletoFirstDue:event.target.value} : item))} /></label>}<p className="text-sm text-muted sm:col-span-2">O valor informado será dividido entre os meses. Os boletos ficam disponíveis até 29 dias antes de cada vencimento.</p></div>}
              </div>)}
              {!manualMethods.length && <p className="text-sm text-amber-800">Cadastre uma forma manual com uma conta de pagamento ativa em Formas de Pagamento.</p>}
              <div className="flex flex-wrap gap-2"><button className="secondary-button" type="button" disabled={payments.length >= 5} onClick={() => setPayments(current => [...current, { id: Date.now(), method: "", amount: "" }])}>Adicionar pagamento</button><button className="secondary-button" type="button" onClick={() => { const remaining = Math.max(0, total - paidTotal + (paymentsPayload.at(-1)?.amountInCents ?? 0)); setPayments(current => current.map((item, index) => index === current.length - 1 ? { ...item, amount: (remaining / 100).toFixed(2).replace(".", ",") } : item)); }}>Preencher restante</button></div>
              <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-3" role="status" aria-live="polite" aria-atomic="true" aria-label="Resumo da divisão dos pagamentos">
                <div><p className="text-sm text-muted">Total da venda</p><p className="text-lg font-extrabold tabular-nums">{currency(total)}</p></div>
                <div><p className="text-sm text-muted">Valor distribuído</p><p className="text-lg font-extrabold tabular-nums">{currency(paidTotal)}</p></div>
                <div className={paidTotal > total ? "text-red-700" : paidTotal === total ? "text-emerald-700" : "text-brand"}><p className="text-sm font-bold">{paidTotal > total ? "Valor excedente" : "Saldo a pagar"}</p><p className="text-2xl font-extrabold tabular-nums">{currency(Math.abs(total - paidTotal))}</p></div>
              </div>
            </fieldset>
            {hasBoletoPlan && <p className="rounded-xl border bg-amber-50 p-3 text-sm">Venda a prazo: identifique o cliente. A venda será concluída com saldo a receber. Pacotes serão liberados após a quitação.</p>}
            {mercadoPagoRules && <fieldset className="grid min-w-0 gap-2 rounded-xl border p-3">
                <legend className="px-1 text-sm font-bold">Parcelamento no cartão</legend>
                <label className="grid gap-1 text-sm font-bold">Limite oferecido nesta venda
                  <select key={mercadoPagoMaximum} name="onlineCardMaximum" className="field" defaultValue={mercadoPagoMaximum}>
                    <option value={1}>À vista no cartão (1×)</option>
                    {Array.from({ length: mercadoPagoMaximum - 1 }, (_, index) => <option key={index + 2} value={index + 2}>Até {index + 2}×</option>)}
                  </select>
                </label>
                <p className="text-sm text-muted">Parcela mínima de {currency(mercadoPagoRules.minimumInCents)} pela regra da empresa.
                  {mercadoPagoMaximum === 1 && cardPaymentAmount > 0 && cardPaymentAmount < 2 * mercadoPagoRules.minimumInCents && ` Em 2×, cada parcela seria de aproximadamente ${currency(Math.floor(cardPaymentAmount / 2))}.`}
                  {mercadoPagoRules.interestFree > 1 && ` A regra da empresa prevê até ${mercadoPagoRules.interestFree}× sem juros.`}
                </p>
                <p className="text-sm text-muted">O comprador escolhe a quantidade de parcelas no checkout. O Mercado Pago apresenta os valores e as condições sem juros disponíveis na conta.</p>
              </fieldset>}
            {checkoutProvider === "asaas" && onlineMethods.some(method => payments.some(payment => payment.method === method.id) && ["credit_card", "link"].includes(method.kind)) && <><p className="text-sm text-muted">Neste PDV, o Asaas recebe cartão à vista. Para parcelar, use a emissão de cobrança avulsa.</p><AsaasCardFees scope="pos" /></>}
            {checkoutProvider === "pagbank" && onlineMethods.some(method => payments.some(payment => payment.method === method.id) && ["credit_card", "link"].includes(method.kind)) && <PagBankInstallmentFields defaults={onlineInstallmentPolicy ?? onlineInstallmentRules()} amount={cardPaymentAmount} canOverride={canOverridePagBank} scope="pos" />}
            {!onlinePayment && <div className="grid gap-2 rounded-2xl border p-3"><div className="flex flex-wrap items-center gap-4"><p className="text-sm font-extrabold">Enviar recibo</p><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="sendReceiptWhatsapp" checked={sendReceiptWhatsapp} onChange={(event) => setSendReceiptWhatsapp(event.target.checked)} /> WhatsApp</label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="sendReceiptEmail" checked={sendReceiptEmail} onChange={(event) => setSendReceiptEmail(event.target.checked)} /> E-mail</label></div>{sendReceiptWhatsapp ? <PhoneInput name="receiptPhone" value={receiptPhone} onValueChange={setReceiptPhone} placeholder="WhatsApp: (71) 99999-9999" /> : null}{sendReceiptEmail ? <input className="field" name="receiptEmail" type="email" value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value)} placeholder="E-mail do comprador" /> : null}<p className="text-xs text-muted">O recibo para impressora térmica será aberto ao concluir.</p></div>}
            {cashError && <p className="text-sm text-amber-800" role="status">{cashError}</p>}
            <button className="primary-button justify-center" disabled={Boolean(cashError) || !cart.length || (paidTotal !== total || (onlinePayment && paymentsPayload.some(payment => payment.amountInCents <= 0)) || payments.some(payment => !(onlinePayment ? onlineMethods : manualMethods).some(method => method.id === payment.method))) || Boolean(discountError) || (requiresClient && !clientId) || (withCommission && !selectedCommission)}>{onlinePayment ? `${hasBoletoPlan ? "Concluir venda a prazo e gerar cobranças" : `Gerar cobrança${payments.length > 1 ? "s" : ""}`} ${onlineProvider?.name ?? "integrada"}` : "Confirmar pagamento"}</button>
          </ActionForm>
        </ModalShell>
      </section>
      <div className="min-w-0 xl:col-span-2">
      {quoteId ? <div className="panel"><h2 className="font-extrabold">Converter orçamento em venda</h2><p className="mt-2 text-sm text-muted">Confira os itens e informe o pagamento para concluir a venda com os valores do orçamento.</p></div> : <PosCatalog variants={variants} cart={cart} addToCart={addToCart} initialType={initialItemType} />}
      </div>

      <aside className="panel form-stack xl:sticky xl:top-5">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand"><ShoppingCart className="size-5" /></span><div><h2 className="text-lg font-extrabold">Carrinho</h2><p className="text-sm text-muted">{cart.length} {cart.length === 1 ? "item" : "itens"}</p></div></div>
        <div className="divide-y rounded-2xl border px-3">
          {cart.map((item) => {
            const variant = variantsById.get(item.variantId)!;
            return <div className="grid gap-2 py-3" key={item.variantId}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-extrabold">{variant.label}</p><p className="text-xs text-muted">{currency(variant.priceInCents)} cada{variant.barcode ? ` · cód. ${variant.barcode}` : " · sem código"}</p></div><button className="icon-button text-red-700" type="button" disabled={Boolean(quoteId)} aria-label={`Remover ${variant.label}`} onClick={() => removeFromCart(item.variantId)}><Trash2 className="size-4" /></button></div><div className="flex items-center justify-between gap-3"><div className="flex items-center rounded-xl border bg-white"><button className="grid size-9 place-items-center" type="button" disabled={Boolean(quoteId)} aria-label={`Diminuir ${variant.label}`} onClick={() => item.quantity === 1 ? removeFromCart(item.variantId) : setQuantity(item.variantId, item.quantity - 1)}><Minus className="size-3.5" /></button><input className="w-12 border-x bg-transparent text-center text-sm font-bold outline-none" type="number" min="1" max={variant.stock} disabled={Boolean(quoteId)} value={item.quantity} onChange={(event) => setQuantity(item.variantId, Number(event.target.value))} aria-label={`Quantidade de ${variant.label}`} /><button className="grid size-9 place-items-center" type="button" disabled={Boolean(quoteId) || item.quantity >= variant.stock} aria-label={`Aumentar ${variant.label}`} onClick={() => setQuantity(item.variantId, item.quantity + 1)}><Plus className="size-3.5" /></button></div><strong>{currency(variant.priceInCents * item.quantity - item.discountInCents)}</strong></div>{canDiscount && !quoteId && <label className="flex items-center justify-between gap-3 text-xs font-bold text-muted">Desconto deste item (R$)<input className="field w-28" inputMode="decimal" value={(item.discountInCents / 100).toFixed(2).replace(".", ",")} onChange={(event) => setItemDiscount(item.variantId, event.target.value)} /></label>}</div>;
          })}
          {cart.length === 0 && <p className="py-8 text-center text-sm text-muted">O carrinho está vazio.</p>}
        </div>
        {canDiscount && !quoteId && <OrderDiscountField type={discountType} value={discountValue} onTypeChange={setDiscountType} onValueChange={setDiscountValue} error={discountError} />}
        <div className="grid gap-1 rounded-2xl bg-brand/5 p-4 text-sm"><div className="flex justify-between text-muted"><span>Subtotal</span><span>{currency(subtotal)}</span></div><div className="flex justify-between text-muted"><span>Desconto</span><span>- {currency(Math.min(discountInCents, subtotal))}</span></div><div className="mt-2 flex items-end justify-between border-t pt-3"><strong>Total</strong><strong className="text-2xl text-brand">{currency(total)}</strong></div></div>
      </aside>
    </div>
  );
}
