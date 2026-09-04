import { AgendaPage } from "@/components/agenda-page";

export const metadata = { title: "Agenda" };

export default async function AgendaRoute({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AgendaPage filters={await searchParams} />;
}
