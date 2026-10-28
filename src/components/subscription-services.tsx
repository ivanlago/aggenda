import type { ReactNode } from "react";

export function SubscriptionServices({ signatureControl, signaturesActive = false, documentLimit = 50 }: { signatureControl?: ReactNode; signaturesActive?: boolean; documentLimit?: number }) {
  return <section id="servicos-complementares" className="grid min-w-0 gap-4">
    <div><h2 className="text-xl font-extrabold">Serviços complementares</h2><p className="mt-2 text-sm text-muted">Adicionais opcionais para quem tem um plano do Aggenda. Não estão incluídos automaticamente nos três planos.</p></div>
    <div className="grid items-start gap-4">
      <article className="min-w-0 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-extrabold">Assinatura eletrônica</h3><span className="status-pill">{signaturesActive ? "Incluída na contratação atual" : "Adicional opcional"}</span></div>
        <p className="mt-3 text-sm">Adicional padrão: 50 documentos concluídos por mês. Valor mensal de referência: <strong>R$ 19,90</strong>; o total do período é apresentado antes do pagamento.</p>
        {signaturesActive && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">Sua franquia do ciclo atual é de {documentLimit} documentos, conforme as condições do plano, piloto e adicionais ativos.</p>}
        <dl className="mt-4 grid gap-4 text-sm">
          <div><dt className="font-bold">Assinatura do cliente ou paciente</dt><dd className="mt-1 text-muted">Termos, contratos e autorizações assinados eletronicamente pelo destinatário. O cliente não precisa de certificado digital.</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">Documentos enviados reservam unidades para permitir a conclusão. Documentos e evidências já registrados permanecem acessíveis ao esgotar a franquia.</p>
        {signatureControl && <div className="mt-4 border-t pt-4">{signatureControl}</div>}
      </article>
    </div>
  </section>;
}

