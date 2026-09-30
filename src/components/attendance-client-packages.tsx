import { requireAttendance } from "@/lib/attendance";
import { getPosPackageBalances, type PosPackageBalance } from "@/lib/pos-package-balances";

export async function AttendanceClientPackages({ appointmentId }: { appointmentId: string }) {
  const { appointment, organization } = await requireAttendance(appointmentId);
  const balances = await getPosPackageBalances(organization.id, appointment.clientId);
  const packages = new Map<string, PosPackageBalance[]>();
  for (const balance of balances) {
    if (balance.expired) continue;
    const items = packages.get(balance.clientPackageId) ?? [];
    items.push(balance);
    packages.set(balance.clientPackageId, items);
  }

  return <details className="panel mt-5">
    <summary className="cursor-pointer font-extrabold">Pacotes do cliente</summary>
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[...packages].map(([id, items]) => {
        const pack = items[0];
        const expiration = pack.expiresAt ? new Date(pack.expiresAt).toLocaleDateString("pt-BR", { timeZone: organization.timezone }) : null;
        return <article key={id} className="flex min-w-0 flex-col rounded-2xl border p-5">
          <h3 className="break-words text-lg font-extrabold">{pack.packageName}</h3>
          <ul className="my-4 space-y-1 text-sm text-muted">
            {items.map((item) => <li key={item.id}>{item.remaining}x {item.serviceName}{Boolean(item.reserved) && <span> · {item.reserved} reservada(s)</span>}</li>)}
          </ul>
          <p className="mt-auto text-sm font-bold text-muted">{expiration ? `Vencimento: ${expiration}` : "Sem vencimento"} · Ativo</p>
        </article>;
      })}
    </div>
    {!packages.size && <p className="mt-3 text-sm text-muted">Nenhum pacote disponível para este cliente.</p>}
  </details>;
}
