import Link from "next/link";
import { PaginatedCollection } from "@/components/paginated-collection";
import { formatOrganizationDateTime } from "@/lib/organization-time";

type Document = { id: string; title: string; createdAt: Date; issuedAt?: Date | null; signedAt?: Date | null; documentType: string; professionalName?: string | null };
export function ClientDocumentList({ documents, timezone, canIssue = false }: { documents: Document[]; timezone: string; canIssue?: boolean }) {
  return <PaginatedCollection label="Documentos do cliente" className="mt-4 divide-y">{documents.map(document => <article key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
    <div className="min-w-0"><p className="break-words font-extrabold">{document.title}</p><p className="text-xs text-muted">{formatOrganizationDateTime(document.issuedAt ?? document.signedAt ?? document.createdAt, timezone)}{document.professionalName ? ` · ${document.professionalName}` : ""}</p></div>
    <div className="flex flex-wrap gap-2"><Link className="secondary-button" href={`/api/documents/${document.id}/pdf`} target="_blank" rel="noopener noreferrer">Abrir PDF original</Link>
      {canIssue && document.documentType === "prescription" && <Link className="secondary-button" href={`/documentos/receitas?reuse=${document.id}`}>Criar nova receita a partir desta</Link>}
      {canIssue && document.documentType === "exam_request" && <Link className="secondary-button" href={`/documentos/exames?reuse=${document.id}`}>Criar nova solicitação a partir desta</Link>}
    </div>
  </article>)}{!documents.length && <p className="empty-state">Nenhum documento emitido para este cliente.</p>}</PaginatedCollection>;
}
