import { searchTussCatalog } from "@/lib/tuss-catalog";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const table = url.searchParams.get("table") === "20" ? "20" : "22";
  const query = (url.searchParams.get("q") ?? "").slice(0, 120);
  try {
    const items = await searchTussCatalog(table, query);
    return Response.json({ items, available: true, table });
  } catch (error) {
    const unavailable = error instanceof Error && "code" in error && error.code === "ENOENT";
    return Response.json({
      items: [], available: false, table,
      error: unavailable ? `O catálogo TUSS ${table} ainda não foi instalado.` : "Não foi possível consultar o catálogo TUSS.",
    }, { status: unavailable ? 404 : 500 });
  }
}

