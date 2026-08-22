import { searchCidCatalog } from "@/lib/cid-catalog";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 120) ?? "";
  try {
    return Response.json({ items: await searchCidCatalog(query), available: true });
  } catch (error) {
    const unavailable = error instanceof Error && "code" in error && error.code === "ENOENT";
    return Response.json({
      items: [],
      available: false,
      error: unavailable ? "A tabela CID-10 ainda não foi instalada." : "Não foi possível consultar a tabela CID-10.",
    }, { status: unavailable ? 404 : 500 });
  }
}
