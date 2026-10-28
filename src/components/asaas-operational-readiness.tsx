export function AsaasOperationalReadiness({ metadata, events }: { metadata: Record<string, unknown>; events: { eventType: string }[] }) {
  const webhookStatus = String(metadata.webhookStatus ?? "não configurado");
  return (<details className="panel mb-5"><summary className="cursor-pointer text-lg font-extrabold text-brand">Validação operacional do Asaas</summary><p className="mt-2 text-sm text-muted">O painel reconhece evidências reais registradas pelo Asaas. Execute o roteiro primeiro em Testes e repita em Produção com valores controlados.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
      ["Conta autenticada", Boolean(metadata.testedAt)],
      ["Webhook ativo", webhookStatus === "active"],
      ["Emissão validada", events.some((event) => event.eventType === "charge_created")],
      ["Pagamento e baixa", events.some((event) => ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event.eventType))],
      ["Cancelamento/estorno", events.some((event) => ["PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"].includes(event.eventType))],
    ].map(([label, ready]) => <div className={`rounded-xl border p-3 text-sm font-bold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`} key={String(label)}>{ready ? "✓" : "○"} {String(label)}</div>)}</div><ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted"><li>Emitir Pix, boleto, link e cartão e conferir valores, vencimento e pagador.</li><li>Pagar uma cobrança e confirmar a baixa automática da conta a receber.</li><li>Vencer outra cobrança e validar a régua e o status de inadimplência.</li><li>Cancelar uma pendente e estornar uma paga, conferindo a reabertura financeira.</li><li>Repetir em produção e registrar as evidências acima antes da liberação geral.</li></ol></details>);
}
