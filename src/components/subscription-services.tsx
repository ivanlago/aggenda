import type { ReactNode } from "react";

export function SubscriptionServices({ signatureControl, signaturesActive = false, documentLimit = 50 }: { signatureControl?: ReactNode; signaturesActive?: boolean; documentLimit?: number }) {
  return <section id="servicos-complementares" className="grid min-w-0 gap-4">
    <div><h2 className="text-xl font-extrabold">Serviços complementares</h2><p className="mt-2 text-sm text-muted">Adicionais opcionais para quem tem um plano do Aggenda. Não estão incluídos automaticamente nos três planos.</p></div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <article className="min-w-0 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-extrabold">Assinatura eletrônica</h3><span className="status-pill">{signaturesActive ? "Incluída na contratação atual" : "Adicional opcional"}</span></div>
        <p className="mt-3 text-sm">Adicional padrão: 50 documentos concluídos por mês. Valor mensal de referência: <strong>R$ 19,90</strong>; o total do período é apresentado antes do pagamento.</p>
        {signaturesActive && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">Sua franquia do ciclo atual é de {documentLimit} documentos, conforme as condições do plano, piloto e adicionais ativos.</p>}
        <dl className="mt-4 grid gap-4 text-sm">
          <div><dt className="font-bold">Assinatura do cliente ou paciente</dt><dd className="mt-1 text-muted">Termos, contratos e autorizações assinados eletronicamente pelo destinatário. O cliente não precisa de certificado digital.</dd></div>
          <div><dt className="font-bold">Assinatura do profissional de saúde</dt><dd className="mt-1 text-muted">Para o fluxo profissional disponível, é necessário e-CPF ICP-Brasil A1 válido, do próprio profissional, instalado no Windows, além de cadastro e habilitação no Aggenda. O certificado é adquirido separadamente e não está incluído neste serviço.</dd></div>
          <div className="rounded-xl bg-amber-50 p-3 text-amber-950"><dt className="font-bold">Liberação profissional em homologação</dt><dd className="mt-1">A compra da franquia não libera automaticamente a assinatura de documentos de saúde. O fluxo profissional depende da habilitação do piloto e da validação com o certificado real. Não inclui assinatura em nuvem/mobile nem promessa de compatibilidade A3.</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">A franquia é compartilhada pelos dois fluxos. Documentos enviados reservam unidades para permitir a conclusão. Documentos e evidências já registrados permanecem acessíveis ao esgotar a franquia.</p>
        {signatureControl && <div className="mt-4 border-t pt-4">{signatureControl}</div>}
      </article>
      <article className="min-w-0 rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-extrabold">Emissão de notas fiscais</h3><span className="status-pill">Em homologação</span></div>
        <p className="mt-3 text-sm text-muted">Emissão de NFS-e de serviços vinculada à clínica, com configuração fiscal própria. Disponível para contratação após liberação do fluxo fiscal de produção.</p>
        <dl className="mt-4 grid gap-4 text-sm">
          <div><dt className="font-bold">O que a clínica precisa</dt><dd className="mt-1 text-muted">Cadastro fiscal da empresa, CNPJ e inscrições aplicáveis, enquadramento e códigos de serviço conferidos com o contador, além de habilitação compatível com o município atendido.</dd></div>
          <div><dt className="font-bold">Certificado para o fluxo fiscal atual</dt><dd className="mt-1 text-muted">Certificado ICP-Brasil A1 com CNPJ da clínica, válido e compatível com a integração. É diferente do e-CPF pessoal do profissional e deve ser adquirido separadamente.</dd></div>
        </dl>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">A contratação e a cobrança deste adicional permanecem indisponíveis até a homologação. Cadastro do certificado, sozinho, não comprova habilitação para emitir notas.</p>
      </article>
    </div>
  </section>;
}

