import { ActionForm } from "./action-form";
import { setPosPaymentDefault } from "@/actions/pos-payment-settings";
import { posProviderNames } from "@/lib/pos-providers";

export function PosPaymentDefaultControl({ active, isDefault, canManage, provider = "mercado_pago" }: { active: boolean; isDefault: boolean; canManage: boolean; provider?: string }) {
  if (!active) return null;
  return <div className="my-4 rounded-xl border bg-slate-50 p-4"><p className="text-sm font-bold">{isDefault ? `${posProviderNames[provider]} é o provedor padrão do PDV` : "Recebimento integrado disponível no PDV"}</p>
    {canManage && <ActionForm key={`${provider}:${isDefault}`} action={setPosPaymentDefault} successMessage="Preferência de recebimento do PDV atualizada." className="mt-3 flex flex-wrap items-center gap-3"><input type="hidden" name="provider" value={provider} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" value="true" defaultChecked={isDefault} />Usar como provedor padrão no PDV</label><button className="secondary-button">Salvar preferência</button></ActionForm>}
    <p className="mt-2 text-xs text-muted">A preferência vale somente para esta empresa. No caixa, o operador ainda pode escolher recebimento manual.</p>
  </div>;
}
