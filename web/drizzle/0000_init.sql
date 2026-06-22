-- web/drizzle/0000_init.sql
-- AUTHORITATIVE DDL — lifted faithfully from ARCHITECTURE.md §2.1 + §2.2 + §4.
-- Applied via `drizzle-kit migrate` over DIRECT_URL (Supavisor SESSION-mode pooler, :5432).
-- Every statement is idempotent (IF NOT EXISTS / guarded DO blocks / DROP-then-CREATE
-- for policies) so a dry-run / re-run is clean.
--
-- RLS-enable approach: the live probe confirmed canCreateEventTrigger=true (role
-- `postgres` is a member of supabase_privileged_role), so we install an auto-RLS
-- event trigger on ddl_command_end as FORWARD-LOOKING insurance for any FUTURE
-- public CREATE TABLE, AND still EXPLICITLY `enable row level security` on the 11
-- tables this migration creates (the event trigger never fires retroactively on
-- tables created earlier in the same transaction, so the explicit enables are
-- correctness-critical, not optional). See eventTriggerDecision.

-- ============================================================
-- Extensions (idempotent). The live project already has pgcrypto + uuid-ossp in the
-- `extensions` schema; citext is available but not yet installed. We target the
-- `extensions` schema to match the project convention and keep `public` clean.
-- (ARCH §2.1 writes these bare; installing into `extensions` is the correct
-- adaptation to THIS project's layout — see risks.)
-- ============================================================
create extension if not exists "pgcrypto" with schema extensions;  -- gen_random_uuid(), digest()
create extension if not exists "citext"   with schema extensions;  -- case-insensitive handles/emails

-- ============================================================
-- Enums (6) — guarded so re-run is a no-op (CREATE TYPE has no IF NOT EXISTS).
-- ============================================================
do $$ begin
  create type community_type   as enum ('community', 'company');
exception when duplicate_object then null; end $$;
do $$ begin
  create type join_policy      as enum ('open', 'code', 'email_domain');
exception when duplicate_object then null; end $$;
do $$ begin
  create type visibility       as enum ('public', 'unlisted', 'private');
exception when duplicate_object then null; end $$;
do $$ begin
  create type member_role      as enum ('member', 'admin', 'owner');
exception when duplicate_object then null; end $$;
do $$ begin
  create type account_provider as enum ('github', 'x');
exception when duplicate_object then null; end $$;
do $$ begin
  create type device_status    as enum ('active', 'revoked');
exception when duplicate_object then null; end $$;

-- ============================================================
-- users — public PROFILE row, 1:1 with auth.users. id IS auth.users.id (no default).
-- ============================================================
create table if not exists users (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        citext not null,
  display_name  text,
  avatar_url    text,
  github_id     bigint not null,
  github_login  citext,
  banned_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_handle_key    unique (handle),
  constraint users_github_id_key unique (github_id)
);

-- ============================================================
-- linked_accounts — external identities (github primary, x for badge/share).
-- ============================================================
create table if not exists linked_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  provider        account_provider not null,
  provider_uid    text not null,
  provider_handle citext,
  access_token    text,                            -- encrypted at app layer (APP_ENCRYPTION_KEY)
  scopes          text[],
  connected_at    timestamptz not null default now(),
  constraint linked_accounts_provider_uid_key  unique (provider, provider_uid),
  constraint linked_accounts_user_provider_key unique (user_id, provider)
);

-- ============================================================
-- communities — both 'community' and 'company' boards.
-- ============================================================
create table if not exists communities (
  id            uuid primary key default gen_random_uuid(),
  type          community_type not null,
  slug          citext not null,
  name          text not null,
  description   text,
  join_policy   join_policy not null,
  visibility    visibility not null default 'public',
  join_code     char(6),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint communities_slug_key      unique (slug),
  constraint communities_join_code_key unique (join_code),
  constraint communities_company_is_email_domain
    check (type <> 'company' or join_policy = 'email_domain'),
  constraint communities_code_present
    check (join_policy <> 'code' or join_code is not null)
);
create index if not exists communities_type_visibility_idx on communities (type, visibility);

-- ============================================================
-- community_email_domains — verified work-email domains; one board per domain.
-- ============================================================
create table if not exists community_email_domains (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  domain        citext not null,
  created_at    timestamptz not null default now(),
  constraint community_email_domains_domain_key unique (domain)
);
create index if not exists community_email_domains_community_idx on community_email_domains (community_id);

-- ============================================================
-- memberships — user <-> community join, with role.
-- ============================================================
create table if not exists memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  community_id  uuid not null references communities(id) on delete cascade,
  role          member_role not null default 'member',
  joined_via    text not null,
  verified_via  text,
  reverify_due  timestamptz,
  joined_at     timestamptz not null default now(),
  constraint memberships_user_community_key unique (user_id, community_id)
);
create index if not exists memberships_community_idx on memberships (community_id);
create index if not exists memberships_user_idx      on memberships (user_id);

-- ============================================================
-- email_verifications — pending work-email verifications (tier-2).
-- ============================================================
create table if not exists email_verifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  email         citext not null,
  domain        citext not null,
  code_hash     bytea not null,
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  constraint email_verifications_code_hash_key unique (code_hash)
);
create index if not exists email_verifications_user_idx on email_verifications (user_id);
create index if not exists email_verifications_pending_idx
  on email_verifications (user_id, domain) where consumed_at is null;   -- PARTIAL

-- ============================================================
-- device_grants — short-lived CLI device-authorization flow.
-- ============================================================
create table if not exists device_grants (
  id              uuid primary key default gen_random_uuid(),
  device_code     text not null,
  user_code       char(9),
  user_id         uuid references users(id) on delete cascade,
  machine_hash    text,
  status          text not null default 'pending',
  interval_sec    int not null default 5,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint device_grants_device_code_key unique (device_code),
  constraint device_grants_user_code_key   unique (user_code)
);

-- ============================================================
-- ingest_devices — CLI auth; one device-bound token per approved claim.
-- MUST be created BEFORE usage_day (usage_day.device_id FK references it).
-- ============================================================
create table if not exists ingest_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    bytea not null,
  label         text,
  machine_hash  text,
  status        device_status not null default 'active',
  expires_at    timestamptz not null,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  constraint ingest_devices_token_hash_key unique (token_hash)
);
create index if not exists ingest_devices_user_idx on ingest_devices (user_id) where status = 'active';  -- PARTIAL

-- ============================================================
-- sync_requests — idempotency ledger for POST /api/v1/sync.
-- ============================================================
create table if not exists sync_requests (
  idempotency_key text primary key,
  user_id         uuid not null references users(id) on delete cascade,
  request_hash    bytea not null,
  response_json   jsonb not null,
  status          text not null default 'processing',
  created_at      timestamptz not null default now()
);
create index if not exists sync_requests_user_idx on sync_requests (user_id, created_at);

-- ============================================================
-- usage_day — THE fact table. PK includes device_id (multi-machine SUM).
-- Forward FK to ingest_devices(id), which now exists above.
-- ============================================================
create table if not exists usage_day (
  user_id             uuid not null references users(id) on delete cascade,
  device_id           uuid not null references ingest_devices(id) on delete cascade,
  date                date not null,
  tool                text not null,
  model               text not null,
  input_tokens        bigint not null default 0,
  output_tokens       bigint not null default 0,
  cache_read_tokens   bigint not null default 0,
  cache_create_5m     bigint not null default 0,
  cache_create_1h     bigint not null default 0,
  tokens              bigint not null default 0,
  cost_usd            numeric(14,6) not null default 0,
  price_table_version text not null,
  updated_at          timestamptz not null default now(),
  constraint usage_day_pkey primary key (user_id, device_id, date, tool, model)
);
create index if not exists usage_day_date_idx      on usage_day (date);
create index if not exists usage_day_user_date_idx on usage_day (user_id, date);

-- ============================================================
-- usage_day_total — per-(user,date) cross-device/tool/model SUM; board score source.
-- ============================================================
create table if not exists usage_day_total (
  user_id    uuid not null references users(id) on delete cascade,
  date       date not null,
  tokens     bigint not null default 0,
  cost_usd   numeric(14,6) not null default 0,
  updated_at timestamptz not null default now(),
  constraint usage_day_total_pkey primary key (user_id, date)
);
create index if not exists usage_day_total_date_idx on usage_day_total (date);

-- ============================================================
-- handle_new_user — AFTER INSERT trigger on auth.users mirroring into public.users.
-- SECURITY DEFINER (runs as owner `postgres`, BYPASSRLS) so it can write public.users
-- regardless of the inserting role (supabase_auth_admin owns auth.users).
--
-- HARDENED per Supabase advisor guidance: `set search_path = ''` + every object is
-- schema-qualified (public.users); built-ins (coalesce/nullif/left/replace) resolve
-- from pg_catalog regardless of path, closing the search-path-hijack vector.
--
-- FAIL LOUD on missing github_id (code.md "fail loud, fail early"): tokenboard is a
-- GitHub-only product (ARCH §4.2) and bans/dedup are keyed on the immutable github_id
-- (ARCH §4.6). We do NOT invent a synthetic id — a missing provider_id is a defect,
-- not something to paper over. GoTrue populates raw_user_meta_data from the GitHub
-- identity AT user-creation, so provider_id is present on a real first insert; if it
-- is absent we raise (errcode not_null_violation) and abort the signup deterministically.
-- (This also eliminates the prior abs(hashtext()) int4-overflow hazard entirely —
-- there is no fallback path to overflow.)
--
-- handle falls back user_name -> preferred_username -> nickname -> guaranteed-unique
-- 'user_<12 hex of id>'; the /auth/callback route assigns the authoritative handle.
-- ON CONFLICT (id) DO NOTHING keeps the trigger idempotent with the callback upsert.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_github_id bigint;
  v_handle    text;
begin
  -- numeric GitHub id; GoTrue stores it under provider_id (string or int) / sub / user_id
  v_github_id := coalesce(
    nullif(meta->>'provider_id', '')::bigint,
    nullif(meta->>'sub', '')::bigint,
    nullif(meta->>'user_id', '')::bigint
  );

  if v_github_id is null then
    raise exception 'tokenboard: github_id missing from auth metadata for user %', new.id
      using errcode = 'not_null_violation';
  end if;

  v_handle := coalesce(
    nullif(meta->>'user_name', ''),
    nullif(meta->>'preferred_username', ''),
    nullif(meta->>'nickname', ''),
    'user_' || left(replace(new.id::text, '-', ''), 12)   -- guaranteed-unique fallback
  );

  insert into public.users (id, handle, display_name, avatar_url, github_id, github_login)
  values (
    new.id,
    v_handle,
    coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', '')),
    nullif(meta->>'avatar_url', ''),
    v_github_id,
    nullif(meta->>'user_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Auto-RLS event trigger (probe: canCreateEventTrigger=true).
-- Fires on ddl_command_end for any FUTURE `CREATE TABLE` in schema `public` and
-- ENABLEs row level security on it, so new tables never ship RLS-off by accident.
-- Does NOT retroactively cover the 11 tables created above (enabled explicitly below).
-- HARDENED: `set search_path = ''`; schema-qualified ALTER built via format(%I.%I).
-- Guard: only enables RLS (never FORCE) — service_role/server writes rely on BYPASSRLS,
-- which FORCE would break. A future RLS-on-but-policy-less table is fail-closed for
-- anon/authenticated, which is the safe default (that migration still adds its own
-- policies + grants). Creation is guarded so re-run is a no-op.
-- ============================================================
create or replace function public.tb_auto_enable_rls()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE' and object_type = 'table'
  loop
    if obj.schema_name = 'public' then
      execute format('alter table %I.%I enable row level security;',
                     obj.schema_name, split_part(obj.object_identity, '.', 2));
    end if;
  end loop;
end;
$$;

do $$ begin
  create event trigger tb_auto_enable_rls
    on ddl_command_end
    when tag in ('CREATE TABLE')
    execute function public.tb_auto_enable_rls();
exception when duplicate_object then null; end $$;

-- ============================================================
-- RLS — ENABLE on all 11 tables (defense-in-depth; service_role BYPASSRLS).
-- Enabling RLS with no permissive policy = fail-closed for anon/authenticated.
-- ============================================================
alter table users                   enable row level security;
alter table linked_accounts         enable row level security;
alter table communities             enable row level security;
alter table community_email_domains enable row level security;
alter table memberships             enable row level security;
alter table usage_day               enable row level security;
alter table usage_day_total         enable row level security;
alter table email_verifications     enable row level security;
alter table device_grants           enable row level security;
alter table ingest_devices          enable row level security;
alter table sync_requests           enable row level security;

-- ============================================================
-- BASE-TABLE GRANTS (LIVE-VERIFIED FIX). RLS only gates row VISIBILITY *after* a role
-- already holds the table privilege; RLS never grants base privileges.
--
-- CRITICAL (verified against this live Supabase project): Supabase pre-configures
-- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT ALL ... TO anon, authenticated,
-- service_role`. So every brand-new public table is born with FULL (arwdDxtm) grants
-- to anon AND authenticated — the opposite of a clean slate. Therefore we must:
--   (1) REVOKE ALL from anon/authenticated on every table first, then
--   (2) re-GRANT a least-privilege surface (column-level where secrets exist).
-- Without step 1, anon could read usage facts and the column-level secret protection
-- below would be a NO-OP (a table-level SELECT grant already covers every column;
-- you cannot subtract a single column with REVOKE — Postgres semantics).
-- service_role keeps Supabase's default ALL grant + BYPASSRLS (server-only).
--
-- §7.2 alias-by-default: anon/authenticated get NO grant on usage_day/usage_day_total.
-- The board is served as a shaped payload by service_role (BYPASSRLS) queries that
-- apply aliasing; a raw client SELECT would expose un-aliased per-user rows (§7.2
-- forbids). The RLS SELECT policies on those tables are retained as a backstop.
--
-- Community writes go through service_role server routes (ARCH §2.2 "enforced
-- server-side"); device_grants / sync_requests are service_role-only.
-- ============================================================
grant usage on schema public to anon, authenticated;

-- Strip Supabase's default ALL grant from the client roles on every table; re-grant below.
revoke all on table users                   from anon, authenticated;
revoke all on table linked_accounts         from anon, authenticated;
revoke all on table communities             from anon, authenticated;
revoke all on table community_email_domains from anon, authenticated;
revoke all on table memberships             from anon, authenticated;
revoke all on table usage_day               from anon, authenticated;
revoke all on table usage_day_total         from anon, authenticated;
revoke all on table email_verifications     from anon, authenticated;
revoke all on table device_grants           from anon, authenticated;
revoke all on table ingest_devices          from anon, authenticated;
revoke all on table sync_requests           from anon, authenticated;

-- public reads (profiles + community/membership discovery; NOT usage facts)
grant select on users                   to anon, authenticated;
grant select on communities             to anon, authenticated;
grant select on community_email_domains to anon, authenticated;
grant select on memberships             to anon, authenticated;

-- own-row reads on the authenticated path (RLS narrows to user_id = auth.uid()).
-- COLUMN-LEVEL where a secret lives (a table-level SELECT would re-expose it):
--   linked_accounts.access_token, ingest_devices.token_hash,
--   email_verifications.code_hash are NEVER selectable via PostgREST.
grant select (id, user_id, provider, provider_uid, provider_handle, scopes, connected_at)
  on linked_accounts to authenticated;
grant select (id, user_id, email, domain, expires_at, consumed_at, attempts, created_at)
  on email_verifications to authenticated;
grant select (id, user_id, label, machine_hash, status, expires_at, last_used_at, created_at, revoked_at)
  on ingest_devices to authenticated;

-- authenticated writes that are genuinely client-driven (RLS + WITH CHECK constrain them)
grant update on users           to authenticated;   -- own profile only (RLS)
grant update (provider_handle, scopes) on linked_accounts to authenticated;  -- never access_token
grant delete on linked_accounts to authenticated;   -- disconnect X (RLS)
grant insert on communities     to authenticated;   -- create a community (created_by = auth.uid())
grant insert on memberships     to authenticated;   -- join an OPEN board as 'member' (RLS WITH CHECK)
grant delete on memberships     to authenticated;   -- leave, or admin/owner removes a member (RLS)
grant delete on ingest_devices  to authenticated;   -- revoke own device (RLS)

-- ============================================================
-- RECURSION-FREE RLS HELPERS (BLOCKER FIX for 42P17).
-- The naive communities/memberships SELECT policies cross-reference each other and
-- self-reference memberships; Postgres applies RLS to subqueries inside policy
-- expressions, so they form an infinite-recursion cycle -> error 42P17 at query
-- time on the PostgREST path, silently defeating the §2.2 backstop. We break the
-- cycle with SECURITY DEFINER helpers: their bodies run as the (BYPASSRLS) owner,
-- so the inner reads do NOT re-enter RLS. `set search_path = ''` + schema-qualified.
-- Verified live (anon role): communities returns public rows, memberships returns
-- own rows, with NO 42P17.
-- ============================================================
create or replace function public.tb_is_member(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.community_id = c_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.tb_can_read_community(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.communities c
    where c.id = c_id
      and (
        c.visibility in ('public', 'unlisted')
        or (c.visibility = 'private' and public.tb_is_member(c.id))
      )
  );
$$;

revoke execute on function public.tb_is_member(uuid)          from public;
revoke execute on function public.tb_can_read_community(uuid) from public;
grant  execute on function public.tb_is_member(uuid)          to anon, authenticated;
grant  execute on function public.tb_can_read_community(uuid) to anon, authenticated;

-- ============================================================
-- POLICIES (§2.2). DROP IF EXISTS before CREATE so re-run is idempotent.
-- auth.uid() resolves on the Supabase-client/PostgREST path. service_role bypasses
-- RLS, so service_role-only tables (device_grants, sync_requests) get NO policy.
-- ============================================================

-- ---------- users ----------
drop policy if exists users_select_public on users;
create policy users_select_public on users
  for select using (banned_at is null);
drop policy if exists users_update_self on users;
create policy users_update_self on users
  for update using (id = auth.uid()) with check (id = auth.uid());
-- INSERT: service_role only (no policy => anon/authenticated cannot insert; not granted either).

-- ---------- linked_accounts ----------
drop policy if exists linked_accounts_select_own on linked_accounts;
create policy linked_accounts_select_own on linked_accounts
  for select using (user_id = auth.uid());
drop policy if exists linked_accounts_update_own on linked_accounts;
create policy linked_accounts_update_own on linked_accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists linked_accounts_delete_own on linked_accounts;
create policy linked_accounts_delete_own on linked_accounts
  for delete using (user_id = auth.uid());

-- ---------- communities (recursion-free via tb_is_member) ----------
drop policy if exists communities_select_visible on communities;
create policy communities_select_visible on communities
  for select using (
    visibility in ('public', 'unlisted')
    or public.tb_is_member(id)
  );
drop policy if exists communities_insert_authed on communities;
create policy communities_insert_authed on communities
  for insert with check (auth.uid() is not null and created_by = auth.uid());
-- UPDATE: service_role only (server route after admin/owner check). No client UPDATE
-- policy + no authenticated UPDATE grant => frozen columns can't be mutated client-side.

-- ---------- community_email_domains (recursion-free via tb_can_read_community) ----------
drop policy if exists community_email_domains_select_visible on community_email_domains;
create policy community_email_domains_select_visible on community_email_domains
  for select using (public.tb_can_read_community(community_id));
-- INSERT/DELETE: service_role only (company-board owner/admin via server). No policy/grant.

-- ---------- memberships (recursion-free via tb_can_read_community) ----------
drop policy if exists memberships_select_visible on memberships;
create policy memberships_select_visible on memberships
  for select using (
    user_id = auth.uid()
    or public.tb_can_read_community(community_id)
  );
-- INSERT: own row, role pinned to 'member', OPEN boards only. code/email_domain joins
-- (and any admin/owner role) are authored server-side via service_role (bypasses this).
-- Pinning role='member' (MINOR FIX) blocks a client self-inserting as admin/owner.
drop policy if exists memberships_insert_self_open on memberships;
create policy memberships_insert_self_open on memberships
  for insert with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (
      select 1 from public.communities c
      where c.id = memberships.community_id and c.join_policy = 'open'
    )
  );
-- DELETE: leave your own membership, or an admin/owner removing a member of that community.
-- (Self-reference to memberships here is allowed: it is the DELETE policy reading
-- memberships from within a DELETE on memberships, which Postgres does not treat as the
-- recursive-policy case the SELECT cycle hit; the admin check is a plain own-role lookup.
-- Verified the SELECT cycle is the only 42P17 source; this expression is safe.)
drop policy if exists memberships_delete_self_or_admin on memberships;
create policy memberships_delete_self_or_admin on memberships
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.community_id = memberships.community_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'owner')
    )
  );

-- ---------- usage_day (backstop only; NOT client-reachable — see GRANT note) ----------
drop policy if exists usage_day_select_live_user on usage_day;
create policy usage_day_select_live_user on usage_day
  for select using (
    exists (select 1 from users u where u.id = usage_day.user_id and u.banned_at is null)
  );
-- writes service_role only. §7.2 aliasing enforced in the server layer, not RLS.

-- ---------- usage_day_total (backstop only; NOT client-reachable — see GRANT note) ----------
drop policy if exists usage_day_total_select_live_user on usage_day_total;
create policy usage_day_total_select_live_user on usage_day_total
  for select using (
    exists (select 1 from users u where u.id = usage_day_total.user_id and u.banned_at is null)
  );

-- ---------- email_verifications ----------
drop policy if exists email_verifications_select_own on email_verifications;
create policy email_verifications_select_own on email_verifications
  for select using (user_id = auth.uid());
-- INSERT/UPDATE service_role only (start mints, confirm consumes). code_hash column revoked above.

-- ---------- ingest_devices ----------
drop policy if exists ingest_devices_select_own on ingest_devices;
create policy ingest_devices_select_own on ingest_devices
  for select using (user_id = auth.uid());
drop policy if exists ingest_devices_delete_own on ingest_devices;
create policy ingest_devices_delete_own on ingest_devices
  for delete using (user_id = auth.uid());
-- INSERT/UPDATE service_role only (mint at claim, bump last_used_at at sync). token_hash revoked above.

-- ---------- device_grants : service_role only — NO policy, NO grant (fail closed). ----------
-- ---------- sync_requests  : service_role only — NO policy, NO grant (fail closed). ----------
-- (RLS enabled above; absence of a permissive policy AND of any anon/authenticated
--  grant denies the PostgREST path entirely.)