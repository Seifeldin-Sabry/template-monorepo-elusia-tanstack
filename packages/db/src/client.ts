import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Builds a database handle without reading process.env, so callers can validate
 * configuration first and inject a test database when needed.
 */
export function createDatabase(connectionString: string) {
  if (!connectionString) {
    throw new Error("A PostgreSQL connection string is required.");
  }

  // Disabling prepared statements keeps the same connection setup compatible
  // with ordinary PostgreSQL and PgBouncer transaction pooling (including Neon).
  const client = postgres(connectionString, { max: 10, prepare: false });
  const db = drizzle({ client, schema });

  return {
    db,
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];
