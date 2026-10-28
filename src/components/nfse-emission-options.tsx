import Link from "next/link";
import { nfseRequirements, type NfseEmissionMode } from "@/lib/nfse/emission-options";
import { nfseMunicipalities, nfseMunicipalityReference } from "@/lib/nfse/municipalities";

export function NfseEmissionOptions({ mode, municipalityCode, regime, canManageBilling }: { canManageBilling: boolean; mode: NfseEmissionMode; municipalityCode: string; regime: string }) {
  const requirements = nfseRequirements(municipalityCode, regime);
  const reference = nfseMunicipalityReference(municipalityCode, regime);
  return <section className="panel mb-5" aria-labelledby="nfse-options-title">
    <h2 id="nfse-options-title" className="text-xl font-extrabold">Como deseja trabalhar com as notas?</h2>
    <p className="mt-2 text-sm text-muted">O certificado não é obrigatório em todos os emissores. Os requisitos dependem do município, do perfil fiscal e do canal de emissão.</p>
    <form method="get" action="/financeiro/nfse" className="mt-4 grid items-end gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">Município do prestador<select className="field" name="municipio" defaultValue={municipalityCode}><option value="">Selecione</option>{nfseMunicipalities.map((city) => <option key={city.code} value={city.code}>{city.name}</option>)}{municipalityCode && !reference && <option value={municipalityCode}>Outro município — IBGE {municipalityCode} (sob análise)</option>}</select></label>
      <label className="grid gap-2 text-sm font-bold">Perfil fiscal da empresa<select className="field" name="regime" defaultValue={regime || ""}><option value="">Selecione</option><option value="simples_nacional">Simples Nacional — ME/EPP</option><option value="lucro_presumido">Lucro presumido</option><option value="lucro_real">Lucro real</option><option value="mei">MEI</option></select></label>
      <label className="grid gap-2 text-sm font-bold md:col-span-2">Forma de trabalho<select className="field" name="modo" defaultValue={mode}><option value="external">Emitir fora do Aggenda e registrar a nota</option><option value="a1">Integrar com A1 — piloto nacional</option><option value="municipal">Consultar integração prevista para o município</option></select></label>
      <button className="secondary-button justify-self-start">Ver requisitos</button>
    </form>
    {!requirements.identified && <p className="mt-4 text-sm text-muted">Informe o município e o perfil fiscal para orientar a análise. Essa seleção não credencia o prestador nem confirma cobertura.</p>}
    {reference ? <div className="mt-4 rounded-xl border p-4 text-sm">
      <h3 className="font-bold">{reference.name} — referência para preparação</h3>
      <dl className="mt-3 grid gap-3 md:grid-cols-2">
        <div><dt className="font-bold">Classificação municipal na Focus</dt><dd>{reference.provider} · {reference.format}</dd></div>
        <div><dt className="font-bold">Canal a validar para o regime selecionado</dt><dd>{regime ? reference.providerForRegime : "Selecione o regime tributário"}</dd></div>
        <div><dt className="font-bold">Autenticação da integração</dt><dd>{reference.authentication}</dd></div>
        <div><dt className="font-bold">Cancelamento na referência municipal</dt><dd>{reference.cancellation}</dd></div>
      </dl>
      <p className="mt-3">{reference.requirements}</p>
      {"history" in reference && <p className="mt-3 text-muted">{reference.history}</p>}
      {regime && <p className="mt-3 text-amber-900">{reference.regimeNotice}</p>}
      <p className="mt-3 font-bold">No Aggenda: cadastro preparatório disponível; emissão automática regional ainda não homologada. A Focus é referência de classificação, não uma integração ativa.</p>
      <a href={reference.source} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-bold text-brand underline">Consultar referência da Focus</a><p className="mt-1 text-xs text-muted">Referência revisada em 27/10/2026; confirme mudanças antes de emitir.</p>
    </div> : <p className="mt-4 text-sm text-muted">O escopo regional inicial é Salvador e Lauro de Freitas. Outros municípios continuam sob análise.</p>}
    {mode === "external" && <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950"><h3 className="font-bold">Registro externo disponível, sem cadastrar certificado no Aggenda</h3><p className="mt-2">Emita pelo portal autorizado para sua empresa ou por outro emissor. Depois, registre o número, valor, endereço de verificação e o recebimento correspondente.</p><p className="mt-2">O portal pode exigir senha, gov.br ou certificado conforme o seu cadastro. Registrar a nota aqui não transmite uma nova nota, não confirma sua autenticidade e não consome a franquia de emissão automática.</p><a href="#notas-externas" className="mt-3 inline-block font-bold underline">Registrar ou consultar notas externas</a></div>}
    {mode === "a1" && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-bold">Conector atual: A1 com CNPJ, somente homologação</h3><p className="mt-2">A assinatura e a transmissão pelo servidor exigem o A1 da empresa neste conector. A consulta municipal não comprova habilitação individual. O piloto atual é restrito ao cenário tributário descrito abaixo; os demais perfis dependem de análise.</p><p className="mt-2">Não há suporte fiscal A3 neste fluxo. A produção continua bloqueada até homologação.</p></div>}
    {mode === "municipal" && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><h3 className="font-bold">Integração regional ainda não homologada</h3><p className="mt-2">As referências de Salvador e Lauro de Freitas exigem certificado na integração. O acesso por senha ao portal não substitui esse requisito. O Aggenda ainda precisa homologar o canal e as regras tributárias antes de oferecer a emissão.</p><p className="mt-2">Não informe senha municipal ou gov.br em outros campos.</p><a href="#notas-externas" className="mt-3 inline-block font-bold underline">Usar o registro de notas externas enquanto isso</a></div>}
    <p className="mt-4 text-sm text-muted">A contratação e as condições comerciais ficam em Administração → Assinaturas. {canManageBilling && <Link className="font-bold text-brand underline" href="/assinatura#servicos-complementares">Consultar serviços</Link>}</p>
  </section>;
}
