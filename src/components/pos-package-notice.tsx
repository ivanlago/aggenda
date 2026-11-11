import { ModalShell } from "@/components/modal-shell";
import type { PosPackageBalance } from "@/lib/pos-package-balances";

export function PosPackageNotice({ balances, timezone = "America/Bahia" }: { balances: PosPackageBalance[]; timezone?: string }) {
  const activeBalances = balances.filter(balance => !balance.expired && (balance.remaining > 0 || (balance.reserved ?? 0) > 0));
  if (!activeBalances.length) return null;
  return <ModalShell title="Pacotes ativos do cliente" variant="edit" triggerLabel="Cliente possui pacote ativo" triggerStyle="link" compact>
    <p className="mt-1 text-sm">Confira os saldos e a validade com o cliente antes de cobrar os serviços.</p>
    <ul className="mt-3 grid max-h-60 gap-2 overflow-y-auto text-sm">
      {activeBalances.map((balance) => <li key={balance.id} className="rounded-xl border px-3 py-2">
        <p><strong>{balance.serviceName}: {balance.remaining} {balance.remaining === 1 ? "sessão disponível" : "sessões disponíveis"}</strong></p>
        <p className="text-xs">{balance.packageName} · {balance.expiresAt ? `Válido até ${new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(new Date(balance.expiresAt))}` : "Sem vencimento"}</p>
        {!!balance.reserved && <p className="text-xs">Saldo restante: {balance.remaining + balance.reserved} · Reservadas: {balance.reserved} (ainda não consumidas).</p>}
      </li>)}
    </ul>
  </ModalShell>;
}
