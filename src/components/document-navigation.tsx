import Link from "next/link";

const sections = [
  { id: "clinicos", label: "Emitir documento clínico", href: "/documentos/clinicos" },
  { id: "juridicos", label: "Emitir documento jurídico", href: "/documentos/juridicos" },
  { id: "emissao", label: "Outros documentos profissionais", href: "/documentos?aba=emissao" },
  { id: "modelos", label: "Modelos", href: "/documentos?aba=modelos" },
  { id: "historico", label: "Histórico", href: "/documentos/historico" },
] as const;

export function DocumentNavigation({ active }: { active: typeof sections[number]["id"] }) {
  return <nav aria-label="Áreas de documentos" className="app-tabs">
    {sections.map(section => <Link key={section.id} className="app-tab" href={section.href} aria-current={active === section.id ? "page" : undefined}>{section.label}</Link>)}
  </nav>;
}
