import { ExamRequestsPage } from "@/components/document-forms/exames";
export const metadata = { title: "Solicitação de exames" };
export default function Page(props: { searchParams: Promise<{ reuse?: string }> }) { return <ExamRequestsPage {...props} />; }
