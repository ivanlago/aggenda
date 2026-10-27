import { ActionForm } from "./action-form";
import { setPosPaymentDefault } from "@/actions/pos-payment-settings";

export function PosPaymentDefaultControl({ active, isDefault, canManage }: { active: boolean; isDefault: boolean; canManage: boolean }) {
  if (!active) return null;
  return <div className="my-4 rounded-xl border bg-slate-50 p-4"><p className="text-sm font-bold">{isDefault ? "Mercado Pago é o provedor padrão do PDV" : "Recebimento integrado disponível no PDV"}</p>
    {canManage && <ActionForm action={setPosPaymentDefault} successMessage="Preferência de recebimento do PDV atualizada." className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" value="true" defaultChecked={isDefault} />Usar como provedor padrão no PDV</label><button className="secondary-button">Salvar preferência</button></ActionForm>}
    <p className="mt-2 text-xs text-muted">A preferência vale somente para esta empresa. No caixa, o operador ainda pode escolher recebimento manual.</p>
  </div>;
}
