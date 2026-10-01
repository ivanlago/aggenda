import { PrescriptionsPage } from "@/components/document-forms/receitas";
export const metadata = { title: "Receita médica" };
export default function Page(props: { searchParams: Promise<{ reuse?: string }> }) { return <PrescriptionsPage {...props} />; }
