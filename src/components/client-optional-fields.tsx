type ClientDetails = {
  address?: string | null;
  postalCode?: string | null;
  maritalStatus?: string | null;
  cpf?: string | null;
};

export function ClientOptionalFields({ client = {} }: { client?: ClientDetails }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Endereço (opcional)
        <input className="field" name="address" defaultValue={client.address ?? ""} autoComplete="street-address" placeholder="Rua, número, complemento, bairro e cidade" />
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-bold">CEP (opcional)
        <input className="field" name="postalCode" defaultValue={client.postalCode ?? ""} autoComplete="postal-code" inputMode="numeric" maxLength={9} placeholder="00000-000" />
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-bold">Estado civil (opcional)
        <select className="field" name="maritalStatus" defaultValue={client.maritalStatus ?? ""}>
          <option value="">Não informado</option>
          <option value="Solteiro(a)">Solteiro(a)</option>
          <option value="Casado(a)">Casado(a)</option>
          <option value="União estável">União estável</option>
          <option value="Separado(a)">Separado(a)</option>
          <option value="Divorciado(a)">Divorciado(a)</option>
          <option value="Viúvo(a)">Viúvo(a)</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-bold">CPF (opcional)
        <input className="field" name="cpf" defaultValue={client.cpf ?? ""} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" />
      </label>
    </div>
  );
}
