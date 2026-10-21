import { referenceResponse } from "@/lib/reference-api";
export async function GET(request: Request) {
  const table = new URL(request.url).searchParams.get("table") === "20" ? "20" : "22";
  return referenceResponse(request, `tuss-${table}`);
}
