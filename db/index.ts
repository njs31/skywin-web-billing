import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// In development every code reload re-runs this module; reuse one pool so reloads don't
// open fresh connections until Postgres refuses more. Production loads it once.
const globalForDb = globalThis as unknown as { skywinPg?: ReturnType<typeof postgres> };
const client = globalForDb.skywinPg ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.skywinPg = client;

export const db = drizzle(client, { schema });
