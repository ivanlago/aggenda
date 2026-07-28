export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-8">
      <p className="text-sm font-extrabold text-brand">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{description}</p>
    </header>
  );
}
