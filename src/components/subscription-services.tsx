import type { ReactNode } from "react";
import { nfseMunicipalities } from "@/lib/nfse/municipalities";

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
        <div className="mt-4 rounded-xl border p-3 text-sm"><h4 className="font-bold">Escopo inicial — Grande Salvador</h4><ul className="mt-2 grid gap-2">{nfseMunicipalities.map((city) => <li key={city.code}><strong>{city.name}:</strong> {city.provider} · {city.format}. <a className="font-bold text-brand underline" href={city.source} target="_blank" rel="noopener noreferrer">Referência Focus</a></li>)}</ul><p className="mt-3 text-muted">Classificação para preparação do cadastro, sujeita ao regime e à habilitação do CNPJ. Conectores regionais e Lucro Presumido/Real ainda dependem de implementação e homologação. A classificação não confirma emissão disponível no Aggenda.</p></div>
        <dl className="mt-4 grid gap-4 text-sm">
          <div><dt className="font-bold">O que a clínica precisa</dt><dd className="mt-1 text-muted">Cadastro fiscal da empresa, CNPJ e inscrições aplicáveis, enquadramento e códigos de serviço conferidos com o contador, além de habilitação compatível com o município atendido.</dd></div>
          <div><dt className="font-bold">Autenticação depende da integração</dt><dd className="mt-1 text-muted">O conector atual do Aggenda exige certificado ICP-Brasil A1 com CNPJ da clínica. Isso não é uma exigência universal de NFS-e. Emissores municipais podem aceitar usuário e senha, conforme suporte e credenciamento; essas alternativas ainda dependem de integração e homologação no Aggenda. O certificado, quando exigido, é adquirido separadamente.</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted">Você pode registrar no financeiro uma nota emitida em outro sistema sem cadastrar certificado no Aggenda. O registro externo não equivale à emissão automática.</p>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">A contratação e a cobrança deste adicional permanecem indisponíveis até a homologação. Cadastro do certificado, sozinho, não comprova habilitação para emitir notas.</p>
      </article>
    </div>
  </section>;
}

