import "dotenv/config";

import { defineConfig } from "drizzle-kit";

import { normalizeDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL!),
  },
});
