import { referenceResponse } from "@/lib/reference-api";
export async function GET(request: Request) { return referenceResponse(request, "anvisa-medications"); }
