// web/src/db/migrate.ts — PROGRAMMATIC MIGRATE RUNNER (DIRECT_URL, max:1, own conn)
// Run with: cd web && pnpm exec dotenv -e ../.env -- tsx src/db/migrate.ts
// (`drizzle-kit migrate` is the simpler default; this is for CI/scripts.)
//
// IMPORTANT: DIRECT_URL points at the Supavisor SESSION-mode pooler on :5432 (NOT a
// true db.<ref>.supabase.co direct connection, and NOT the :6543 transaction pooler).
// It works for DDL/migrations and event-trigger creation (verified live). We keep
// max:1 (single session) and prepare:false — session-mode Supavisor can still mishandle
// server-side prepared statements in some configs, so prepare:false is the safe default
// even off the transaction pooler.
import "dotenv/config";
import { drizzle as drizzleMigrate } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function runMigrations() {
  if (!process.env.DIRECT_URL) {
    throw new Error("DIRECT_URL is required for migrations (web/src/db/migrate.ts)");
  }
  const migrationClient = postgres(process.env.DIRECT_URL, { max: 1, prepare: false });
  await migrate(drizzleMigrate(migrationClient), { migrationsFolder: "./drizzle" });
  await migrationClient.end();
}

runMigrations().then(
  () => process.exit(0),
  (err) => {
    console.error("migration failed:", err);
    process.exit(1);
  },
);
