import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const unavailableDatabase = new Proxy({} as ReturnType<typeof drizzle>, {
  get() {
    throw new Error(
      "DATABASE_URL must be set before using database-backed routes.",
    );
  },
});

export const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : null;
export const db = pool ? drizzle(pool, { schema }) : unavailableDatabase;

export * from "./schema";
