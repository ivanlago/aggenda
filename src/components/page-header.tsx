import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="page-heading-copy min-w-0">
      <p className="text-sm font-extrabold text-brand">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
