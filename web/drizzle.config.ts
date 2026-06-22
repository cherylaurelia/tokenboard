// web/drizzle.config.ts
// Migrations run over DIRECT_URL — the Supavisor SESSION-mode pooler on :5432 (NOT
// the :6543 transaction pooler). Verified live: this endpoint can CREATE EVENT
// TRIGGER + CREATE TRIGGER ON auth.users, which the migration needs.
// SQL-first: we ONLY ever run `drizzle-kit generate --custom` (empty journaled .sql,
// into which we paste the authoritative SQL) + `drizzle-kit migrate`. We NEVER run
// bare `generate` or `push`.
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DIRECT_URL) {
  throw new Error("DIRECT_URL is required for migrations (drizzle.config.ts)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts", // TS pgTable defs MIRROR the authoritative SQL
  out: "./drizzle", // 0000_init.sql + meta/_journal.json + meta/*_snapshot.json
  dbCredentials: {
    // DIRECT_URL = ...pooler.supabase.com:5432/postgres (Supavisor SESSION mode).
    // Supabase requires SSL; postgres-js negotiates it from the host. If migrate
    // ever fails on SSL, append ?sslmode=require to DIRECT_URL.
    url: process.env.DIRECT_URL,
  },
  // Explicit (matches defaults) so the §2.2 schema audit can find the ledger.
  migrations: { table: "__drizzle_migrations", schema: "drizzle" },
});
