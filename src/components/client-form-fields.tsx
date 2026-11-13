import { CatalogImageField } from "@/components/catalog-image-field";
import { PhoneInput } from "@/components/phone-input";

type ClientFormData = {
  name?: string; cpf?: string | null; birthDate?: string | null; gender?: string | null;
  weightKg?: string | null; heightCm?: string | null; maritalStatus?: string | null;
  profession?: string | null; email?: string | null; phone?: string | null;
  address?: string | null; postalCode?: string | null; notes?: string | null; imageUrl?: string | null;
};

/** Same field order and responsive layout in creation and editing. */
export function ClientFormFields({ client = {}, clientLabel = "Cliente" }: { client?: ClientFormData; clientLabel?: string }) {
  return <div className="grid min-w-0 gap-4">
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-[176px_minmax(0,1fr)]">
      <div className="w-full max-w-44"><CatalogImageField currentUrl={client.imageUrl} label={`Foto do ${clientLabel.toLowerCase()}`} /></div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-12">
        <label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-8">Nome *<input className="field" name="name" defaultValue={client.name ?? ""} required autoComplete="name" placeholder="Nome completo" /></label>
        <label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-4">CPF<input className="field" name="cpf" defaultValue={client.cpf ?? ""} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></label>
        <label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-6 lg:col-span-3">Data de nascimento<input className="field" name="birthDate" type="date" defaultValue={client.birthDate ?? ""} /></label>
        <label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-6 lg:col-span-3">Sexo<select className="field" name="gender" defaultValue={client.gender ?? ""}><option value="">Não informado</option><option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="not_informed">Prefere não informar</option></select></label>
        <label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-6 lg:col-span-3">Peso (kg)<input className="field" name="weightKg" type="number" inputMode="decimal" min="0.01" max="9999.99" step="0.01" defaultValue={client.weightKg ?? ""} placeholder="Ex.: 70,5" /></label>
        <label className="grid min-w-0 gap-1 text-sm font-bold sm:col-span-6 lg:col-span-3">Altura (cm)<input className="field" name="heightCm" type="number" inputMode="decimal" min="0.01" max="999.99" step="0.01" defaultValue={client.heightCm ?? ""} placeholder="Ex.: 175" /></label>
      </div>
    </div>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
      <label className="grid min-w-0 gap-1 text-sm font-bold">Estado civil<select className="field" name="maritalStatus" defaultValue={client.maritalStatus ?? ""}><option value="">Não informado</option>{["Solteiro(a)", "Casado(a)", "União estável", "Separado(a)", "Divorciado(a)", "Viúvo(a)"].map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">Profissão<input className="field" name="profession" defaultValue={client.profession ?? ""} placeholder="Profissão" /></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">E-mail<input className="field" name="email" type="email" autoComplete="email" defaultValue={client.email ?? ""} placeholder="E-mail" /></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">Telefone / WhatsApp<PhoneInput name="phone" defaultValue={client.phone} autoComplete="tel" /></label>
    </div>
    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
      <label className="grid min-w-0 gap-1 text-sm font-bold">Endereço<input className="field" name="address" defaultValue={client.address ?? ""} autoComplete="street-address" placeholder="Rua, número, complemento, bairro e cidade" /></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">CEP<input className="field" name="postalCode" defaultValue={client.postalCode ?? ""} autoComplete="postal-code" inputMode="numeric" maxLength={9} placeholder="00000-000" /></label>
    </div>
    <label className="grid min-w-0 gap-1 text-sm font-bold">Observações<textarea className="field min-h-24" name="notes" rows={3} defaultValue={client.notes ?? ""} placeholder="Observações" /></label>
    <p className="text-xs text-muted">Campos com * são obrigatórios.</p>
  </div>;
}
