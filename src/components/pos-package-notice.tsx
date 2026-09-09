import { PackageCheck } from "lucide-react";
import type { PosPackageBalance } from "@/lib/pos-package-balances";

export function PosPackageNotice({ balances, timezone = "America/Bahia" }: { balances: PosPackageBalance[]; timezone?: string }) {
  if (!balances.length) return null;
  return <div role="status" aria-live="polite" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
    <p className="flex items-center gap-2 font-extrabold"><PackageCheck className="size-5 shrink-0" aria-hidden="true" /> Este cliente possui saldo de pacotes</p>
    <p className="mt-1 text-sm">Confira os saldos com o cliente antes de cobrar os procedimentos.</p>
    <ul className="mt-3 grid gap-2 text-sm">
      {balances.map((balance) => <li key={balance.id} className="rounded-xl bg-white/70 px-3 py-2">
        <p><strong>{balance.serviceName}: {balance.remaining} {balance.remaining === 1 ? "sessão disponível" : "sessões disponíveis"}</strong></p>
        <p className="text-xs">{balance.packageName} · {balance.expiresAt ? `Válido até ${new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(new Date(balance.expiresAt))}` : "Sem vencimento"}</p>
      </li>)}
    </ul>
  </div>;
}
