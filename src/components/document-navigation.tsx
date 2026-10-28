import Link from "next/link";

export function DocumentNavigation() {
  return <nav aria-label="Áreas de documentos" className="mb-5 flex flex-wrap gap-2">
    <Link className="secondary-button" href="/documentos/clinicos">Emitir documento clínico</Link>
    <Link className="secondary-button" href="/documentos/juridicos">Emitir documento jurídico</Link>
    <Link className="secondary-button" href="/documentos?aba=emissao">Outros documentos profissionais</Link>
    <Link className="secondary-button" href="/documentos?aba=modelos">Modelos</Link>
    <Link className="secondary-button" href="/documentos/historico">Histórico</Link>
  </nav>;
}
