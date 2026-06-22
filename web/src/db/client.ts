// web/src/db/client.ts — APP RUNTIME (Supavisor TRANSACTION pooler :6543, prepare:false)
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL = ...pooler.supabase.com:6543/postgres?prepare=false (transaction mode).
// prepare:false is MANDATORY on the transaction pooler: Supavisor multiplexes many
// client connections onto few backends, so a server-side prepared statement bound to
// one backend breaks on the next round-trip ("prepared statement sN does not exist").
// The ?prepare=false query param is documentation only — postgres-js does NOT honor it;
// you MUST pass { prepare: false } here.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (web/src/db/client.ts)");
}

const client = postgres(process.env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
