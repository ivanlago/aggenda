import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";
import { normalizeDatabaseUrl } from "@/lib/database-url";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada");
}

export const db = drizzle(normalizeDatabaseUrl(process.env.DATABASE_URL), { schema });
