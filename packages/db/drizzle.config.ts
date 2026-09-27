import { defineConfig } from "drizzle-kit";

const migrationUrl =
  process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "Set DATABASE_MIGRATION_URL or DATABASE_URL before running Drizzle Kit.",
  );
}

if (new URL(migrationUrl).hostname.includes("-pooler.")) {
  throw new Error(
    "Migrations need a direct PostgreSQL connection. Set DATABASE_MIGRATION_URL to the direct Neon URL.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: migrationUrl },
  strict: true,
  verbose: true,
});
