import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/profileextract";

// Global pool cache for Next.js hot-reloading in development
const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const isLocalDb =
  connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
export { schema, pool };
