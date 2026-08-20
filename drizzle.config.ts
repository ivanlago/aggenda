import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

import { normalizeDatabaseUrl } from "./src/lib/database-url";

loadEnvConfig(process.cwd());

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL!),
  },
});
