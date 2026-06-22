-- web/drizzle/0001_device_grant_token_handoff.sql
-- Token-handoff channel for the approve->next-poll ingest-token delivery, plus
-- deterministic slow_down timing. Idempotent (IF NOT EXISTS) so a re-run is clean.
--
-- ingest_token_once holds the RAW "tbd_" ingest token ONLY between the browser approve and
-- the CLI's FIRST poll, then is NULLed in the SAME atomic statement that flips the grant to
-- 'complete' (one-time, race-safe — a CTE captures the old value before nulling). The
-- DURABLE record (ingest_devices.token_hash, bytea) stays hash-only-at-rest forever. This
-- transient plaintext is acceptable because device_grants is service_role-only + RLS
-- fail-closed (0000_init.sql: RLS on, no policy, no anon/authenticated grant), the grant
-- expires ~10 min, and consume is a single statement.
--
-- last_polled_at lets the poll route enforce slow_down per-grant without trusting a
-- client-sent timestamp and without external state. Nullable; set on each accepted poll.
--
-- No new GRANT/policy: device_grants already revokes all from anon/authenticated and has RLS
-- enabled with NO permissive policy, so both new columns inherit that fail-closed posture.
-- All app access to these columns is via Drizzle/postgres-js (no PostgREST schema cache).
alter table device_grants add column if not exists ingest_token_once text;
alter table device_grants add column if not exists last_polled_at    timestamptz;

-- Belt-and-suspenders: tell PostgREST to reload its schema cache so any future supabase-js
-- reader sees the new columns. (Phase-4 routes touch these via Drizzle, not PostgREST, so
-- this is defense in depth, not a correctness dependency.)
select pg_notify('pgrst', 'reload schema');
