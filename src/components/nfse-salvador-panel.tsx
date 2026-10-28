import { saveSalvadorDraft } from "@/actions/nfse-salvador";
import { ActionForm } from "@/components/action-form";

type Entry = { id: string; description: string; amount: number; name: string | null; cpf: string | null };
export function NfseSalvadorPanel({ ready, transportReady, entries, selected }: { ready: boolean; transportReady: boolean; entries: Entry[]; selected?: Entry }) {
  return <article className="panel mt-5" aria-labelledby="salvador-pilot-title">
    <h2 id="salvador-pilot-title" className="text-lg font-extrabold">Salvador — piloto municipal de RPS</h2>
    <p className="mt-2 text-sm text-muted">Primeiro cenário: Lucro Presumido, serviço tributado em Salvador, sem retenções, descontos, deduções, benefícios ou regime especial. Não contempla serviços que exijam dados complementares, como construção civil e atividade portuária.</p>
    <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">O rascunho inclui NBS, classificação tributária e indicador da operação do XSD IBS/CBS publicado pelo município. Os códigos precisam ser conferidos com o contador. {transportReady ? "Contrato SOAP configurado para homologação; produção continua bloqueada." : "É possível preparar o rascunho com o A1 cadastrado. O envio e as consultas ficam bloqueados até a configuração do WSDL revisado e a confirmação do leiaute em homologação."}</p>
    {!ready ? <p className="mt-4 text-sm font-bold">Cadastre e autorize um A1 com perfil de Salvador e regime Lucro Presumido para preparar o teste.</p> : <>
      <form action="/financeiro/nfse" method="get" className="mt-4 flex flex-wrap items-end gap-3"><input type="hidden" name="modo" value="municipal" /><label className="grid flex-1 gap-2 text-sm font-bold">Recebimento confirmado<select className="field" name="recebimento" defaultValue={selected?.id ?? ""} required><option value="">Selecione</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {(entry.amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</option>)}</select></label><button className="secondary-button">Preparar RPS</button></form>
      {selected && <ActionForm key={selected.id} action={saveSalvadorDraft} successMessage="Rascunho municipal salvo. Revise a solicitação antes de qualquer envio." resetOnSuccess={false} className="mt-5 grid gap-5">
        <input type="hidden" name="financialEntryId" value={selected.id} />
        <fieldset className="grid gap-3 md:grid-cols-3"><legend className="mb-3 font-bold">Identificação do RPS</legend>
          <label className="grid gap-2 text-sm font-bold">Número do RPS<input className="field" name="rpsNumber" inputMode="numeric" pattern="[1-9][0-9]{0,14}" required /><span className="text-xs font-normal text-muted">Use a faixa autorizada pela prefeitura e exclusiva deste emissor.</span></label>
          <label className="grid gap-2 text-sm font-bold">Série do RPS<input className="field" name="rpsSeries" pattern="[A-Za-z0-9]{1,5}" maxLength={5} required /></label>
          <label className="grid gap-2 text-sm font-bold">Data e hora de emissão (Bahia)<input className="field" name="issuedAt" type="datetime-local" step={60} required /></label>
        </fieldset>
        <fieldset className="grid gap-3 md:grid-cols-2"><legend className="mb-3 font-bold">Pagador e endereço</legend>
          <label className="grid gap-2 text-sm font-bold">Nome / razão social<input className="field" name="payerName" defaultValue={selected.name ?? ""} maxLength={115} required /></label>
          <label className="grid gap-2 text-sm font-bold">CPF / CNPJ<input className="field" name="payerDocument" defaultValue={selected.cpf ?? ""} required /></label>
          <label className="grid gap-2 text-sm font-bold">Logradouro<input className="field" name="street" maxLength={125} required /></label>
          <label className="grid gap-2 text-sm font-bold">Número<input className="field" name="addressNumber" maxLength={10} required /></label>
          <label className="grid gap-2 text-sm font-bold">Bairro<input className="field" name="district" maxLength={60} required /></label>
          <label className="grid gap-2 text-sm font-bold">Município do pagador (IBGE)<input className="field" name="payerMunicipality" pattern="[0-9]{7}" inputMode="numeric" required /></label>
          <label className="grid gap-2 text-sm font-bold">UF<input className="field" name="state" pattern="[A-Za-z]{2}" maxLength={2} required /></label>
          <label className="grid gap-2 text-sm font-bold">CEP<input className="field" name="zip" inputMode="numeric" maxLength={9} required /></label>
        </fieldset>
        <fieldset className="grid gap-3 md:grid-cols-2"><legend className="mb-3 font-bold">Serviço e ISS</legend>
          <label className="grid gap-2 text-sm font-bold">Valor do recebimento<input className="field" name="amount" value={(selected.amount / 100).toFixed(2).replace(".", ",")} readOnly /></label>
          <label className="grid gap-2 text-sm font-bold">Alíquota ISS (%)<input className="field" name="issRate" inputMode="decimal" placeholder="Informe a alíquota confirmada" required /></label>
          <label className="grid gap-2 text-sm font-bold">Item da lista de serviços<input className="field" name="itemList" placeholder="04.01" pattern="[0-9]{2}\.[0-9]{2}" required /></label>
          <label className="grid gap-2 text-sm font-bold">CNAE do serviço<input className="field" name="cnae" inputMode="numeric" maxLength={7} pattern="[0-9]{7}" required /></label>
          <label className="grid gap-2 text-sm font-bold">NBS<input className="field" name="nbs" inputMode="numeric" maxLength={9} pattern="[0-9]{9}" required /></label>
          <label className="grid gap-2 text-sm font-bold">Classificação tributária IBS/CBS<input className="field" name="taxClassification" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required /></label>
          <label className="grid gap-2 text-sm font-bold">Indicador da operação<input className="field" name="operationIndicator" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required /></label>
          <label className="grid gap-2 text-sm font-bold md:col-span-2">Discriminação do serviço<textarea className="field" name="description" maxLength={1200} required /></label>
        </fieldset>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmSalvadorScenario" required /><span>Confirmei com o contador os dados, os códigos de IBS/CBS e o cenário restrito acima. Este rascunho usa o leiaute municipal publicado e não autoriza emissão real.</span></label>
        <button className="secondary-button justify-self-start">Salvar rascunho municipal</button>
      </ActionForm>}
    </>}
  </article>;
}
