type Settings = { returnInterval: number | null; returnIntervalUnit: string; returnReminderDays: number };

export function ServiceReturnFields({ settings }: { settings?: Settings }) {
  return <fieldset className="grid min-w-0 items-start gap-4 rounded-2xl border p-4 lg:grid-cols-3">
    <legend className="px-2 font-extrabold">Retorno sugerido no CRM</legend>
    <label className="grid content-start gap-2 text-sm font-bold">Prazo de retorno<input className="field" name="returnInterval" type="number" min="1" max="3650" defaultValue={settings?.returnInterval ?? ""} placeholder="Sem lembrete" /><span className="text-xs font-normal text-muted">Deixe vazio para não sugerir retorno automaticamente.</span></label>
    <label className="grid content-start gap-2 text-sm font-bold">Unidade<select className="field" name="returnIntervalUnit" defaultValue={settings?.returnIntervalUnit ?? "days"}><option value="days">Dias</option><option value="months">Meses</option></select></label>
    <label className="grid content-start gap-2 text-sm font-bold">Antecedência em dias<input className="field" name="returnReminderDays" type="number" min="0" max="365" defaultValue={settings?.returnReminderDays ?? 7} /><span className="text-xs font-normal text-muted">Quando o retorno começa a aparecer como próximo.</span></label>
  </fieldset>;
}
