import { redirect } from "next/navigation";

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/cliente/${encodeURIComponent(slug)}`);
}
