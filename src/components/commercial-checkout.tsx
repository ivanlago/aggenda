"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { startCommercialCheckout } from "@/actions/commercial-checkout";
import { commercialProducts, commercialQuote, extraQuote, formatBrl, pilotQuote, type CommercialSelection } from "@/lib/commercial-catalog";
import { SubscriptionServices } from "./subscription-services";
import { MaskedInput } from "./masked-input";

export function CommercialCheckout({ pilot = false, disabled = false, extras = false, initialProduct = "essential", initialCycle = "monthly", addon }: { pilot?: boolean; disabled?: boolean; extras?: boolean; initialProduct?: CommercialSelection["product"]; initialCycle?: CommercialSelection["cycle"]; addon?: import("@/lib/commercial-catalog").CommercialQuote & { kind: "addon" } }) {
  const [selection, setSelection] = useState<CommercialSelection>({ product: initialProduct, cycle: initialCycle, professionals: 1, signatures: false, nfse: "none" });
  const [metric, setMetric] = useState<"responses" | "documents">("responses");
  const quote = addon ?? (extras ? extraQuote(metric) : pilot ? pilotQuote() : commercialQuote(selection));
  const [result, action, pending] = useActionState(async (_previous: { error?: string } | undefined, data: FormData) => startCommercialCheckout(data), undefined);
  return <form action={action} className="grid gap-5">
    <input type="hidden" name="pilot" value={pilot ? "1" : "0"} />
    {addon && <><input type="hidden" name="service" value="signatures" /><input type="hidden" name="addonAmount" value={addon.amountInCents} /><input type="hidden" name="addonEndsAt" value={addon.contractEndsAt} /></>}
    {addon ? <div className="rounded-xl border border-brand/30 bg-brand/5 p-4"><h3 className="font-extrabold">Assinatura eletrônica — período proporcional</h3><p className="mt-2 text-2xl font-extrabold">{formatBrl(addon.amountInCents)}</p><p className="mt-2 text-sm">Pagamento único pelo período restante até {new Date(addon.contractEndsAt).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })}. Não substitui o plano.</p><p className="mt-2 text-sm">Valor do plano com o serviço na próxima renovação: {formatBrl(addon.renewalAmountInCents)}. Franquia inicial: {addon.initialDocumentLimit} documentos até a próxima virada mensal; depois, 50 por mês. Franquias não acumulam.</p><p className="mt-2 text-sm">{addon.baseSelection.cycle === "monthly" ? "Na renovação, o serviço passa a compor o valor do plano. No cartão com renovação ativa, a próxima mensalidade será ajustada após a confirmação deste pagamento." : "Na renovação do plano, selecione novamente os serviços desejados. Este pagamento cobre apenas o período atual."}</p></div> : extras ? <div className="rounded-2xl border p-5"><label className="grid gap-2 font-bold">Pacote adicional
      <select className="field" name="extra" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}><option value="responses">500 respostas — R$ 49,90</option><option value="documents">100 documentos — R$ 19,90</option></select></label>
      <p className="mt-3">{formatBrl(quote.amountInCents)} em pagamento único. Liberação após confirmação, válida até o fim da franquia atual. Sem renovação automática. Requer o recurso ativo.</p>
    </div> : pilot ? <div className="rounded-2xl border border-brand/30 bg-brand/5 p-5">
      <h2 className="text-2xl font-extrabold">Piloto anual — Aggenda Completo</h2>
      <p className="mt-3 text-3xl font-extrabold">R$ 5,00 <span className="text-sm">no total por um ano</span></p>
      <p className="mt-2">Pagamento único. Sem renovação automática. Até três profissionais.</p>
      <p className="mt-3 text-sm">A cada mês: 1.000 respostas da Secretária, 30 documentos enviados para assinatura e dez notas nacionais autorizadas. Franquias não acumulam.</p>
      <p className="mt-3 text-sm">Ferramentas atuais e futuras disponíveis durante o piloto, conforme lançamento e habilitação. NFS-e de produção aguarda homologação. Serviços externos e excedentes não são ilimitados. Lembretes e campanhas automáticas exigem saldo separado e ainda não estão habilitados nesta oferta.</p>
    </div> : <>
      <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 font-bold">Escolha seu plano</legend>
        {Object.entries(commercialProducts).map(([id, p]) => <label key={id} className="cursor-pointer rounded-xl border p-4 has-[:checked]:border-brand has-[:checked]:bg-brand/5">
          <input type="radio" name="product" value={id} checked={selection.product === id} onChange={() => setSelection({ ...selection, product: id as CommercialSelection["product"] })} />
          <span className="ml-2 font-extrabold">{p.name}</span>
          <span className="mt-2 block text-sm">{id === "essential" ? "Gestão do negócio" : id === "professional" ? "App + Aggenda Atendimento" : "App + Aggenda Secretária"}</span>
          {id !== "essential" && <span className="mt-1 block text-xs">1.000 respostas/mês; um canal</span>}
        </label>)}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 font-bold">Profissionais com agenda ativa
          <select className="field" name="professionals" value={selection.professionals} onChange={(e) => setSelection({ ...selection, professionals: Number(e.target.value) })}>
            {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>Até {n} {n === 1 ? "profissional" : "profissionais"}</option>)}
          </select>
        </label>
        <label className="grid gap-2 font-bold">Período
          <select className="field" name="cycle" value={selection.cycle} onChange={(e) => setSelection({ ...selection, cycle: e.target.value as CommercialSelection["cycle"] })}>
            <option value="monthly">Mensal</option><option value="semiannual">Semestral — 10% de desconto</option><option value="annual">Anual — aproximadamente 20% de desconto</option>
          </select>
        </label>
      </div>
      <SubscriptionServices signatureControl={<label className="flex items-start gap-3 text-sm font-bold"><input className="mt-1" type="checkbox" name="signatures" checked={selection.signatures} onChange={e => setSelection({ ...selection, signatures: e.target.checked })} />Adicionar assinatura eletrônica à contratação</label>} />
      <div className="rounded-2xl bg-brand/5 p-5" aria-live="polite"><strong className="text-3xl">{formatBrl(quote.amountInCents)}</strong>
        <p>{quote.months === 1 ? "Por mês. Cartão com renovação mensal; Pix com renovação manual." : `Pagamento antecipado por ${quote.months} meses; equivalente a ${formatBrl(quote.equivalentInCents!)} por mês. Sem renovação automática.`}</p>
        <p className="mt-2 text-sm">Franquias renovam mensalmente e não acumulam. Tarifas Meta e serviços externos são separadas. Nenhum excedente é cobrado automaticamente. Lembretes e campanhas automáticas requerem saldo separado e ainda não estão habilitados nesta oferta.</p>
      </div>
    </>}
    <fieldset className="flex gap-6"><legend className="mb-2 font-bold">Forma de pagamento</legend>
      <label><input type="radio" name="paymentMethod" value="pix" defaultChecked /> Pix</label>
      <label><input type="radio" name="paymentMethod" value="credit_card" /> Cartão</label>
    </fieldset>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-bold">CPF/CNPJ<MaskedInput className="field" name="cpfCnpj" mask="cpfCnpj" required /></label>
      <label className="grid gap-1 text-sm font-bold">Telefone<MaskedInput className="field" name="phoneNumber" mask="phone" required /></label>
      <label className="grid gap-1 text-sm font-bold">CEP<MaskedInput className="field" name="postalCode" mask="postalCode" required /></label>
      <label className="grid gap-1 text-sm font-bold">Endereço<input className="field" name="address" required /></label>
      <label className="grid gap-1 text-sm font-bold">Número<input className="field" name="addressNumber" required /></label>
      <label className="grid gap-1 text-sm font-bold">Bairro<input className="field" name="province" required /></label>
    </div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acceptTerms" required />
      <span>Li as condições acima e aceito os <Link href="/termos" target="_blank" className="underline">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank" className="underline">Política de Privacidade</Link>. {addon ? "Autorizo a cobrança proporcional e a inclusão do serviço na renovação mensal automática, quando aplicável, conforme os valores apresentados." : extras ? "Autorizo a compra única do pacote e reconheço sua validade até o fim da franquia atual." : pilot ? "Autorizo a cobrança única de R$ 5,00 pelo piloto anual." : "Ao pagar agora, inicio o período contratado; esta compra não é necessária para experimentar gratuitamente."}</span>
    </label>
    {result?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{result.error}</p>}
    <button disabled={pending || disabled} className="primary-button disabled:opacity-50">{pending ? "Preparando pagamento…" : addon ? "Contratar adicional proporcional" : extras ? "Comprar pacote adicional" : pilot ? "Pagar R$ 5,00 pelo ano de piloto" : "Continuar para pagamento"}</button>
  </form>;
}
