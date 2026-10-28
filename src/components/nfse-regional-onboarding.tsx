import { saveNfseOnboarding } from "@/actions/nfse-onboarding";
import { ActionForm } from "@/components/action-form";
import { nfseMunicipalities } from "@/lib/nfse/municipalities";
import type { NfseOnboarding } from "@/lib/nfse/onboarding";

export function NfseRegionalOnboarding({ initial, canConfigure }: { initial: NfseOnboarding | null; canConfigure: boolean }) {
  return <section className="panel mb-5" aria-labelledby="fiscal-onboarding-title">
    <h2 id="fiscal-onboarding-title" className="text-xl font-extrabold">Preparação fiscal</h2>
    <p className="mt-2 text-sm text-muted">Preparação para Salvador, Lauro de Freitas e Camaçari. Salve os dados da empresa para preparar a homologação, sem enviar certificado ou senha e sem contratar o serviço.</p>
    {initial && <p className="mt-3 text-sm font-bold text-brand" role="status">Dados de preparação salvos. A emissão automática continua pendente de homologação.</p>}
    {canConfigure ? <details className="mt-4" open={!initial}>
      <summary className="cursor-pointer font-bold">{initial ? "Revisar dados da empresa" : "Preparar cadastro da empresa"}</summary>
      <ActionForm action={saveNfseOnboarding} resetOnSuccess={false} successMessage="Preparação salva. Isso não configura um emissor nem libera emissão." className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">CNPJ<input className="field" name="cnpj" autoComplete="off" inputMode="numeric" maxLength={18} defaultValue={initial?.cnpj ?? ""} required /></label>
        <label className="grid gap-2 text-sm font-bold">Município da empresa<select className="field" name="municipalityCode" defaultValue={initial?.municipalityCode ?? ""} required><option value="">Selecione</option>{nfseMunicipalities.map((city) => <option key={city.code} value={city.code}>{city.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold">Regime tributário<select className="field" name="taxRegime" defaultValue={initial?.taxRegime ?? ""} required><option value="">Selecione</option><option value="lucro_presumido">Lucro Presumido</option><option value="lucro_real">Lucro Real</option><option value="simples_nacional">Simples Nacional — ME/EPP</option><option value="mei">MEI</option></select></label>
        <label className="grid gap-2 text-sm font-bold">Inscrição municipal (se já disponível)<input className="field" name="municipalRegistration" maxLength={40} defaultValue={initial?.municipalRegistration ?? ""} /></label>
        <p className="text-sm text-muted md:col-span-2">Confirme com o contador o serviço, CNAE, códigos tributários, alíquotas e retenções. O cadastro acima não altera o perfil fiscal ou certificado já configurado.</p>
        <button className="secondary-button justify-self-start">Salvar preparação</button>
      </ActionForm>
    </details> : <p className="mt-4 text-sm text-muted">O administrador com permissão para gerenciar integrações pode preparar o cadastro.</p>}
  </section>;
}
