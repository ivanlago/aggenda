import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { electronicDocumentEvents, electronicDocuments, organizations } from "@/db/schema";
import { sha256 } from "@/lib/electronic-documents";

import { SignatureForm } from "./signature-form";

export const metadata = { title: "Assinar documento — Aggenda", robots: { index: false, follow: false } };

export default async function PublicSignaturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db.select({ document: electronicDocuments, organizationName: organizations.name }).from(electronicDocuments).innerJoin(organizations, eq(organizations.id, electronicDocuments.organizationId)).where(eq(electronicDocuments.accessTokenHash, sha256(token))).limit(1);
  if (!row) notFound();
  const now = new Date();
  let status = row.document.status;
  if (["pending", "viewed"].includes(status) && row.document.tokenExpiresAt < now) {
    status = "expired";
    await db.update(electronicDocuments).set({ status: "expired", updatedAt: now }).where(and(eq(electronicDocuments.id, row.document.id), eq(electronicDocuments.status, row.document.status)));
    await db.insert(electronicDocumentEvents).values({ organizationId: row.document.organizationId, documentId: row.document.id, eventType: "expired" });
  } else if (status === "pending") {
    status = "viewed";
    await db.update(electronicDocuments).set({ status: "viewed", viewedAt: now, updatedAt: now }).where(and(eq(electronicDocuments.id, row.document.id), eq(electronicDocuments.status, "pending")));
    await db.insert(electronicDocumentEvents).values({ organizationId: row.document.organizationId, documentId: row.document.id, eventType: "viewed" });
  }
  const unavailable = !["pending", "viewed", "signed"].includes(status);
  return <main className="min-h-screen bg-[#f3f5f1] px-4 py-10"><article className="mx-auto max-w-3xl rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
    <p className="text-sm font-extrabold uppercase tracking-wider text-brand">{row.organizationName}</p>
    <h1 className="mt-3 text-3xl font-extrabold">{row.document.title}</h1>
    <p className="mt-2 text-sm text-muted">Documento destinado a {row.document.signerName} · {row.document.signerEmail}</p>
    <div className="my-7 whitespace-pre-wrap rounded-2xl border bg-[#fbfcfa] p-5 text-sm leading-7">{row.document.contentSnapshot}</div>
    {status === "signed" ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><p className="font-extrabold">Documento assinado em {row.document.signedAt?.toLocaleString("pt-BR")}.</p><a className="primary-button mt-4 inline-flex" href={`/api/public/documents/${token}/pdf`}>Baixar minha via em PDF</a></div> : unavailable ? <p className="rounded-2xl bg-amber-50 p-5 font-bold text-amber-900">Este documento está {status === "expired" ? "expirado" : status === "cancelled" ? "cancelado" : "indisponível"}. Solicite um novo envio à clínica.</p> : <SignatureForm token={token} requireResponses={row.document.documentType === "anamnesis"} />}
    <p className="mt-8 text-xs leading-5 text-muted">A assinatura registra a confirmação por e-mail, o desenho, data, hora, endereço IP, navegador e hashes criptográficos do conteúdo e das evidências.</p>
  </article></main>;
}
