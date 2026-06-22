-- web/drizzle/0002_user_is_admin.sql
-- Owner admin flag for the /tuna dashboard gate. AUTHORITATIVE from the DB (not the
-- handle string): require-admin.ts SELECTs is_admin for the viewer; non-admins get
-- notFound() (404). Idempotent (IF NOT EXISTS) so a re-run is clean.
--
-- Self-grant: the migration sets is_admin = true for the owner's immutable github_login
-- (citext, case-insensitive). This is a functional config necessity (like the commit-author
-- identity line) and is kept ONLY in this migration — never echoed into schema.ts, the gate,
-- the page, or any other comment/doc.
--
-- Admin reads/writes go through the service-role (BYPASSRLS) server path, never PostgREST, so
-- NO new GRANT/policy is required. is_admin is otherwise readable by the existing
-- users_select_public policy (just another column on a non-banned row); the column REVOKE below
-- closes that small info-leak (it only ever leaked "this handle is the owner", which is public
-- anyway). The GATE never trusts the client value — it re-reads is_admin server-side via the
-- service role.
alter table users add column if not exists is_admin boolean not null default false;

update users set is_admin = true where github_login = 'angelafeliciaa';

-- Keep is_admin out of PostgREST/supabase-js client reads. Table-level SELECT stays granted (the
-- public board needs the other columns); only the is_admin COLUMN privilege is revoked. Idempotent
-- (REVOKE of a not-granted column privilege is a no-op).
revoke select (is_admin) on users from anon, authenticated;

-- Tell PostgREST to reload its schema cache (the app reads is_admin via Drizzle/postgres-js +
-- service-role, not PostgREST, so this is defense in depth). Mirrors 0001.
select pg_notify('pgrst', 'reload schema');
