import type { ReactNode } from "react";

export function MetricCard({ label, value, icon, valueClassName = "" }: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  valueClassName?: string;
}) {
  return <article className="panel min-w-0">
    <div className="flex items-center gap-2 text-sm text-muted">
      {icon && <span className="shrink-0 text-brand [&>svg]:size-4" aria-hidden="true">{icon}</span>}
      <p>{label}</p>
    </div>
    <p className={`mt-2 break-words text-2xl font-extrabold ${valueClassName}`}>{value}</p>
  </article>;
}
