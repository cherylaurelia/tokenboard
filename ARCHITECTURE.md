# tokenboard — Engineering Architecture

## 0. Introduction

This document is the **engineering architecture** for tokenboard — the canonical technical reference for how the system is built. It is the technical companion to `DESIGN.md`, which holds the product narrative, positioning, and go-to-market story. Where `DESIGN.md` answers *why tokenboard exists and who it's for*, this document answers *how it works*: the data model, API surface, auth flows, sync protocol, leaderboard computation, and the operational concerns (caching, rate limiting, abuse) that hold it together.

tokenboard turns local agentic-coding token usage (Claude Code, Cursor, Codex, Aider, and the long tail) into public, shareable leaderboards. The guiding architectural principles are:

- **Value-first, login-to-claim** — a user sees their number before authenticating; auth is the act of *claiming a public spot*, not a gate in front of the product.
- **Counts in, cost out** — the client uploads token *counts only*; the server computes USD cost from a pinned price-table version. Clients can never game cost-ranked boards.
- **Postgres is the system of record; Redis is a rebuildable index** — every leaderboard score is derivable from `usage_day`. Redis loss is a non-event.
- **Idempotent everywhere** — `Idempotency-Key` at the edge, overwrite-upsert in Postgres, overwrite-`ZADD` in Redis. Retries and out-of-order syncs converge.

### Terminology note

This document uses one consistent vocabulary throughout. Notably:

- A **board** is "rank the members of a community over a window." There is always a global pseudo-community (`g`) plus individual / community / company boards.
- The three membership tiers are **individual**, **community**, and **company**. (Some early drafts called the middle tier "group"; this document uses **community** for the tier and "communities" for the table that holds all three.)
- A device's CLI credential is the **ingest token**, stored hashed in `ingest_devices`. The browser credential is the opaque **session cookie**, stored in `sessions`. These are deliberately separate credential types over the same `users` table.

---

## 1. System Overview

### 1.1 Architecture diagram

```
                          IDENTITY INPUTS
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ GitHub OAuth │  │  Work email  │  │   X (badge / │
        │ (tier-1 spine│  │ (tier-2 magic│  │  share only) │
        │  + identity) │  │  link / OTP) │  │              │
        └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
               │                 │                 │
               ▼                 ▼                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │            API LAYER — Vercel / Next.js App Router         │
   │  ┌──────────────┐   route handlers (/api/v1/*)             │
   │  │ Supabase Auth│   • OAuth callbacks  • /sync (ingest)    │
   │  │ (web, GitHub)│   • /board           • /communities      │
   │  │ + device-tok │   • /verify/email    • /profile          │
   │  │ system (CLI) │   • next/og share-card renderer ─────┐   │
   │  └──────────────┘                                      │   │
   └───────┬───────────────────┬───────────────────┬───────┼───┘
           │                   │                   │       │
   ┌───────▼────────┐  ┌───────▼────────┐  ┌────────▼──┐ ┌──▼──────────┐
   │ Postgres       │  │  Redis (Upstash)│  │  next/og  │ │ Vercel Edge │
   │ (Supabase)     │  │  • ZSET leader- │  │  OG share │ │ CDN cache + │
   │ SYSTEM OF REC. │  │    boards       │  │  card     │ │ ISR tags    │
   │ • users        │  │  • rate limits  │  │  images   │ └─────────────┘
   │ • communities  │  │  • profile cache│  └───────────┘
   │ • memberships  │  │  • idempotency  │
   │ • usage_day    │◀─┤    helpers      │
   │ • ingest_      │  │  (rebuildable   │
   │   devices ...  │  │   index)        │
   └───────┬────────┘  └─────────────────┘
           │  ▲  rebuild / drift-check (nightly)
           └──┘
                          ▲
                          │  Authorization: Bearer tbd_<token>  (ingest only)
              ┌───────────┴────────────┐
              │   tokenboard CLI       │
              │  npx @tokenboard/cli   │
              │  • Claude Code parser  │
              │  • ccusage shell-out   │
              │  • local preview       │
              └────────────────────────┘
```

### 1.2 Component responsibilities

- **tokenboard CLI** (`npx @tokenboard/cli`; the installed bin is `tokenboard`) — reads local agentic-coding logs (first-party Claude Code parser + `ccusage` shell-out for the long tail), aggregates **counts only**, renders a local preview with no network identity, and (after `tokenboard claim`/`login`) uploads aggregates via `POST /api/v1/sync` using a device-bound ingest token.
- **API layer (Vercel / Next.js App Router)** — all business logic lives in route handlers under `/api/v1/*`. Hosts both web auth (**Supabase Auth** / GitHub OAuth, cookie-based JWT sessions via `@supabase/ssr`) and the CLI device-token system, computes server-side cost from the pinned price table, performs idempotent upserts, assembles the shared board contract, and renders share cards via **next/og**.
- **Postgres (Supabase)** — the **system of record**, accessed via **Drizzle** (and the Supabase client on the RLS-enforced path). Identity lives in Supabase's `auth.users`; our `public.users` profile is 1:1 with it. Holds `users`, `linked_accounts`, `communities`, `community_email_domains`, `memberships`, the `usage_day` fact table, `email_verifications`, `ingest_devices`, and the `sync_requests` idempotency ledger. Every other store is derived from it. Authorization is enforced server-side; Row-Level Security is enabled as defense-in-depth (§2.2).
- **Redis (Upstash)** — a **derived, rebuildable index**: sorted-set leaderboards (ZSETs), the previous-period snapshot for deltas, the profile cache, token-bucket rate-limit counters, and idempotency helpers. Never a source of truth.
- **next/og** — renders OG share-card images for profiles and boards (the X-share artifact), keyed by content hash for immutable CDN caching.
- **Vercel Edge CDN + ISR** — caches public board JSON and SSR pages with tag-based invalidation driven by the sync handler.
- **Identity inputs** — **GitHub OAuth** is the tier-1 spine (it *is* the user); **work email** is the tier-2 additive proof (company membership via magic link / OTP); **X** is connect-only, used for a verified badge and sharing, never for authentication.

### 1.3 Request lifecycle (one paragraph)

A typical end-to-end flow: the user runs `npx @tokenboard/cli`, which parses local logs and prints their number instantly with no network identity; when they run `tokenboard claim`, the CLI starts a device-authorization flow, the user approves it in a browser (signing in with **Supabase Auth → GitHub** first if needed), and the server mints a device-bound **ingest token** (storing only its hash in `ingest_devices`); thereafter `tokenboard sync` POSTs count-only aggregates with an `Idempotency-Key` to `/api/v1/sync`, where the Next.js handler resolves the bearer token to a `(user_id, device_id)`, validates and clamps the records, computes **cost server-side** from the pinned LiteLLM price table, performs an idempotent `ON CONFLICT (user_id, device_id, date, tool, model)` upsert into `usage_day` (then recomputes the cross-device `usage_day_total`) in Postgres, then (post-commit) overwrites the affected Redis ZSET leaderboard scores and busts the relevant CDN/ISR caches; finally, anyone — web or CLI — reads the same board via `GET /api/v1/board`, served hot from Redis with a Postgres fallback, with `next/og` producing the shareable card.

---

## 2. Data Model

### 2.1 Postgres DDL

```sql
-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid(), digest()
create extension if not exists "citext";      -- case-insensitive handles/emails

-- ============================================================
-- Enums
-- ============================================================
create type community_type   as enum ('community', 'company');
-- 'individual' is NOT a community — a single GitHub identity is just a users row.
create type join_policy      as enum ('open', 'code', 'email_domain');
create type visibility        as enum ('public', 'unlisted', 'private');
create type member_role       as enum ('member', 'admin', 'owner');
create type account_provider  as enum ('github', 'x');
create type device_status     as enum ('active', 'revoked');

-- ============================================================
-- users — public PROFILE row, 1:1 with Supabase's auth.users.
-- Identity (login/session) lives in Supabase's auth.users; this table holds
-- only the app-facing profile. id IS the auth.users id (uuid FK, cascade),
-- so a user is deleted from public.users when their auth identity is removed.
-- Populated by an `after insert` trigger on auth.users (handle_new_user).
-- No permanent anonymous users; a row exists only after GitHub sign-in.
-- ============================================================
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        citext not null,                 -- public profile slug, e.g. /u/devon
  display_name  text,
  avatar_url    text,
  github_id     bigint not null,                 -- numeric GitHub user id (immutable); mirrored from the GitHub identity
  github_login  citext,                          -- denormalized for display; mutable
  banned_at     timestamptz,                     -- non-null = banned (sybil/abuse); app-level ban flag (also call auth.admin to kill sessions)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_handle_key   unique (handle),
  constraint users_github_id_key unique (github_id)
);
-- Identity, login, and sessions are owned by Supabase Auth (auth.users /
-- auth.sessions); we do NOT define our own sessions table. Server-side
-- revocation uses supabase.auth.admin.signOut() + admin.updateUserById({ban_duration}).

-- ============================================================
-- linked_accounts — external identities (github primary, x for badge/share).
-- One provider account maps to at most one user.
-- ============================================================
create table linked_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  provider        account_provider not null,
  provider_uid    text not null,                 -- provider's stable user id
  provider_handle citext,                         -- @login / @screen_name (display only)
  access_token    text,                           -- encrypted at app layer; nullable for X
  scopes          text[],
  connected_at    timestamptz not null default now(),
  constraint linked_accounts_provider_uid_key unique (provider, provider_uid),
  -- A user connects each provider at most once.
  constraint linked_accounts_user_provider_key unique (user_id, provider)
);

-- (No `sessions` table — web sessions are Supabase-managed JWTs in auth.sessions.
--  linked_accounts below still tracks the X connection for the share badge.)

-- ============================================================
-- communities — both 'community' and 'company' boards live here.
-- Differ only by type + join_policy + visibility.
-- ============================================================
create table communities (
  id            uuid primary key default gen_random_uuid(),
  type          community_type not null,
  slug          citext not null,                  -- /c/<slug>
  name          text not null,
  description   text,
  join_policy   join_policy not null,
  visibility    visibility not null default 'public',
  join_code     char(6),                          -- 6-char code when join_policy='code'
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint communities_slug_key unique (slug),
  constraint communities_join_code_key unique (join_code),
  -- A company board joins by verified email domain; a code board needs a code.
  constraint communities_company_is_email_domain
    check (type <> 'company' or join_policy = 'email_domain'),
  constraint communities_code_present
    check (join_policy <> 'code' or join_code is not null)
);
create index communities_type_visibility_idx on communities (type, visibility);

-- ============================================================
-- community_email_domains — verified work-email domains owning a company board.
-- A confirmed magic-link to devon@acme-corp.com auto-joins the acme-corp.com board.
-- Domain is globally unique: one company board per domain.
-- ============================================================
create table community_email_domains (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references communities(id) on delete cascade,
  domain        citext not null,                  -- normalized lowercase, e.g. acme-corp.com
  created_at    timestamptz not null default now(),
  constraint community_email_domains_domain_key unique (domain)
);
create index community_email_domains_community_idx on community_email_domains (community_id);

-- ============================================================
-- memberships — user <-> community join, with role.
-- ============================================================
create table memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  community_id  uuid not null references communities(id) on delete cascade,
  role          member_role not null default 'member',
  -- how the join was authorized: 'code' | 'open' | 'email_domain' | 'creator'
  joined_via    text not null,
  verified_via  text,                             -- 'github' | 'code' | 'invite' | 'email:<domain>'
  reverify_due  timestamptz,                      -- company tier: 180-day re-verification window
  joined_at     timestamptz not null default now(),
  constraint memberships_user_community_key unique (user_id, community_id)
);
create index memberships_community_idx on memberships (community_id);
create index memberships_user_idx      on memberships (user_id);

-- ============================================================
-- usage_day — THE fact table. Idempotent upsert on ingest.
-- PK (user_id, device_id, date, tool, model) => one row per device per dimension per day.
-- device_id is in the key so a user's MULTIPLE machines (work + personal laptop) SUM
-- rather than overwrite each other. A single device re-syncing the same day overwrites
-- ITS OWN row (last-write-wins, never double counts), because that device's local logs
-- are the complete picture for that device/day. The cross-device total is a SUM (below).
-- Cost is computed server-side from a pinned LiteLLM price table; client never sends cost.
-- ============================================================
create table usage_day (
  user_id            uuid not null references users(id) on delete cascade,
  device_id          uuid not null references ingest_devices(id) on delete cascade,
  date               date not null,               -- local calendar day (TZ offset captured at upload)
  tool               text not null,               -- 'claude-code' | 'cursor' | 'codex' | ...
  model              text not null,               -- 'claude-opus-4-8' | 'gpt-5' | ...
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_create_5m    bigint not null default 0,   -- ephemeral 5-min cache write tokens
  cache_create_1h    bigint not null default 0,   -- ephemeral 1-hour cache write tokens
  tokens             bigint not null default 0,   -- all-in: input+output+cache_read+cache_create_5m+cache_create_1h
  cost_usd           numeric(14,6) not null default 0,  -- server-computed
  price_table_version text not null,              -- which pinned LiteLLM table priced this
  updated_at         timestamptz not null default now(),
  constraint usage_day_pkey primary key (user_id, device_id, date, tool, model)
);
-- Leaderboard aggregation scans by date window then sums per user (across devices).
create index usage_day_date_idx       on usage_day (date);
create index usage_day_user_date_idx  on usage_day (user_id, date);

-- ============================================================
-- usage_day_total — per-(user,date) rollup across ALL devices, tools, and models.
-- This is the cross-device SUM and the leaderboard score source.
-- Recomputed on every sync from usage_day for the affected (user_id, date):
--   SUM(tokens), SUM(cost_usd) over all rows sharing (user_id, date).
-- Source for rolling-window sums and sparklines.
-- ============================================================
create table usage_day_total (
  user_id   uuid not null references users(id) on delete cascade,
  date      date not null,
  tokens    bigint not null default 0,            -- = SUM over every device+tool+model that day
  cost_usd  numeric(14,6) not null default 0,
  updated_at timestamptz not null default now(),
  constraint usage_day_total_pkey primary key (user_id, date)
);
create index usage_day_total_date_idx on usage_day_total (date);

-- ============================================================
-- email_verifications — pending work-email verifications (tier-2).
-- ONE shared 6-digit code per verification, embedded in the magic link AND shown as an OTP.
-- code_hash = sha256(6-digit code); raw code never stored. Security rests on
-- attempt-lockout (~5 tries) + 15m TTL + send/confirm rate-limits — NOT code entropy.
-- Disposable/plus-addr blocked at app layer.
-- ============================================================
create table email_verifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  email         citext not null,                  -- full work email entered
  domain        citext not null,                  -- parsed domain (normalized)
  code_hash     bytea not null,                   -- sha256(6-digit code); same code in link + OTP
  expires_at    timestamptz not null,             -- e.g. now() + 15 min
  consumed_at   timestamptz,                       -- non-null once confirmed
  attempts      int not null default 0,            -- confirm attempts, for lockout (~5)
  created_at    timestamptz not null default now(),
  constraint email_verifications_code_hash_key unique (code_hash)
);
create index email_verifications_user_idx on email_verifications (user_id);
-- Fast lookup of an outstanding (unconsumed, unexpired) verification.
create index email_verifications_pending_idx
  on email_verifications (user_id, domain) where consumed_at is null;

-- ============================================================
-- device_grants — short-lived CLI device-authorization flow (login-to-claim).
-- One row per `tokenboard claim`; consumed when the browser approves it.
-- ============================================================
create table device_grants (
  id              uuid primary key default gen_random_uuid(),
  device_code     text not null,                   -- long secret, CLI-held (hashed at rest)
  user_code       char(9),                         -- short human code, e.g. WXYZ-1234
  user_id         uuid references users(id) on delete cascade,  -- null until approved
  machine_hash    text,                            -- salted hash of stable machine id (de-dup/label only)
  status          text not null default 'pending', -- 'pending' | 'approved' | 'denied' | 'expired'
  interval_sec    int not null default 5,
  expires_at      timestamptz not null,            -- ~10 min
  created_at      timestamptz not null default now(),
  constraint device_grants_device_code_key unique (device_code),
  constraint device_grants_user_code_key   unique (user_code)
);

-- ============================================================
-- ingest_devices — CLI auth. Each approved claim mints a device-bound token.
-- The raw token is shown once to the CLI; only its hash is stored.
-- Bearer in POST /api/v1/sync resolves to (user_id) via token_hash.
-- ============================================================
create table ingest_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    bytea not null,                   -- sha256(raw token)
  label         text,                              -- e.g. "MacBook Pro" / hostname
  machine_hash  text,                              -- salted machine id (de-dup across accounts)
  status        device_status not null default 'active',
  expires_at    timestamptz not null,             -- sliding expiry; sync bumps it forward (silent re-mint)
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  constraint ingest_devices_token_hash_key unique (token_hash)
);
-- Sliding expiry: each successful sync extends expires_at; a token whose window has lapsed
-- is silently re-minted on the cron path (the CLI re-runs the device-claim flow once, transparently),
-- so an actively-used machine never has to manually re-auth, while a long-abandoned device's
-- token eventually expires.
create index ingest_devices_user_idx on ingest_devices (user_id) where status = 'active';

-- ============================================================
-- sync_requests — idempotency ledger for POST /api/v1/sync.
-- Client sends Idempotency-Key; a replay returns the stored result.
-- ============================================================
create table sync_requests (
  idempotency_key text primary key,               -- client-supplied UUID/ULID
  user_id         uuid not null references users(id) on delete cascade,
  request_hash    bytea not null,                  -- sha256(canonical body) — detect key reuse w/ different body
  response_json   jsonb not null,                  -- cached response to replay
  status          text not null default 'processing', -- 'processing' | 'done'
  created_at      timestamptz not null default now()
);
create index sync_requests_user_idx on sync_requests (user_id, created_at);
```

### 2.2 Authorization posture (server-layer first, RLS as backstop)

**Two database access paths, and which enforces RLS:**

1. **Supabase client (`@supabase/ssr`) → PostgREST.** Queries made through the Supabase client forward the user's access-token JWT; PostgREST validates it, switches the Postgres role (`anon`/`authenticated`), and exposes the claims so **`auth.uid()` resolves automatically** — RLS is enforced per-user with zero extra plumbing. With no/expired token, `auth.uid()` is null and policies fail closed.
2. **Drizzle → direct/pooled Postgres connection.** This is our main data path (the leaderboard upserts, windowed aggregates, etc.). It does **not** go through PostgREST, so it carries no JWT — `auth.uid()` would be null and per-user RLS would not apply automatically. Therefore **primary authorization for Drizzle queries happens in the Next.js server layer**: every route handler / server action verifies the Supabase session server-side (`getUser()`/`getClaims()`), derives the `user_id`, and scopes the query in app code (e.g. `where(eq(t.userId, user.id))`).

**So: RLS is enabled on every table as defense-in-depth.** We `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and author the same predicates as policies, so (a) the Supabase-client path is genuinely RLS-gated, and (b) a mistake in server-layer scoping can't trivially leak another user's rows on that path. Roles:
- the **`authenticated`/`anon`** roles (Supabase-client path) under which the public-readable policies hold (e.g. "non-banned users' profiles and usage are world-readable");
- a **`service_role`** (BYPASSRLS) used only by trusted server routes (ingest, auth callback, email confirm, cost computation, leaderboard writes) **after** they've resolved and authorized the `user_id` in code — **server-side only, never exposed to the browser**.

The CLI never talks to Postgres directly — it goes through Next.js route handlers that use `service_role` after resolving the bearer device token.

> **Optional DB-enforced RLS over Drizzle:** if we ever want `auth.uid()` to apply to a Drizzle query too, the `drizzle-orm/supabase` integration runs it inside a transaction that does `set local role …` + `set_config('request.jwt.claims', …, true)` from the verified token, then resets. We don't require this for v1 — server-layer authz is the gate; RLS is the backstop.

In the policy gists below, **`auth.uid()` is the Supabase RLS helper** returning the authenticated caller's `user_id` from the JWT (on the Supabase-client path); on the Drizzle path the equivalent identity check is enforced in server code. It denotes the identity predicate either way.

| Table | RLS | Policy gist |
|---|---|---|
| `users` | on | **SELECT**: all non-banned rows are world-readable (`banned_at is null`) — individual profiles are always public, so there is no `is_public`/`profile_visibility` column and no "shares a community" branch to gate on. **UPDATE**: only `id = auth.uid()`. **INSERT**: service_role only (created at OAuth callback). |
| `linked_accounts` | on | **SELECT/UPDATE/DELETE**: only `user_id = auth.uid()`. `access_token` never exposed via PostgREST (column-level revoke); reads go through server. |
| `communities` | on | **SELECT**: `visibility = 'public'` to everyone; `visibility = 'unlisted'` readable if you know the id (still gated to anon, allowed); `visibility = 'private'` only if `exists (select 1 from memberships m where m.community_id = communities.id and m.user_id = auth.uid())`. **INSERT**: any authenticated user (sets `created_by = auth.uid()`). **UPDATE**: only members with `role in ('admin','owner')`. |
| `community_email_domains` | on | **SELECT**: readable if parent community is readable (same visibility rule). **INSERT/DELETE**: company-board `owner`/`admin` only, via server. |
| `memberships` | on | **SELECT**: your own rows always; other rows readable only if the community is readable to you (so public boards expose their roster, private boards do not). **INSERT**: only `user_id = auth.uid()` AND the join is authorized for that community's `join_policy` (open always; code/email_domain enforced server-side via service_role on the join/verify routes). **DELETE**: your own membership (leave), or admins removing a member. |
| `usage_day` | on | **SELECT**: a row is readable if its owning user is non-banned (`exists (select 1 from users u where u.id = usage_day.user_id and u.banned_at is null)`) — individual profiles are always public, so usage rows are world-readable for any live user (leaderboard reads are mostly served via pre-aggregated server queries / Redis, but direct reads are gated this way). **INSERT/UPDATE/DELETE**: **service_role only** — all writes happen in the ingest route after cost is computed. No client can write usage. |
| `usage_day_total` | on | Same posture as `usage_day`: client-readable when the owning user is non-banned; **writes service_role only** (upserted in the sync transaction). |
| `email_verifications` | on | **ALL**: `user_id = auth.uid()` for reads of own pending state; **INSERT/UPDATE** done by service_role (start mints the code, confirm consumes it). `code_hash` never selectable by clients. |
| `device_grants` | on | service_role only — `device_code`/`user_code` are secrets resolved exclusively by the device-flow routes. |
| `ingest_devices` | on | **SELECT/DELETE(revoke)**: only `user_id = auth.uid()` (manage your devices in settings). **INSERT/UPDATE**: service_role only (mint at claim, bump `last_used_at` at sync). `token_hash` not client-selectable. |
| `sync_requests` | on | service_role only — internal idempotency ledger, never client-facing. |

Defense-in-depth: leaderboard endpoints do **not** rely solely on RLS; the server applies the same membership/visibility predicate in SQL and caches windowed rankings in Upstash Redis sorted sets keyed by `lb:{scope}:{metric}:{window}` (see §7).

---

## 3. API Surface (v1)

Base path `/api/v1`. Auth column: **none** (public), **session** (Supabase Auth JWT cookie from GitHub OAuth, verified server-side via `@supabase/ssr` `getUser()`/`getClaims()`), **device** (CLI bearer = `Authorization: Bearer tbd_<token>`).

| Method | Path | Auth | Request body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/api/auth/login` | none | — | 302 redirect | Calls `signInWithOAuth({provider:'github'})` → Supabase → GitHub. |
| GET | `/auth/callback` | none | `?code` | 302 → app, sets `sb-…-auth-token` cookie | `exchangeCodeForSession(code)`; the `auth.users` insert trigger upserts the `public.users` profile + `linked_accounts(github)`. |
| POST | `/api/v1/cli/login/start` | none | `{ client_name, machine_hash }` | `{ device_code, user_code, verification_url, interval, expires_in }` | OAuth device flow; CLI opens `verification_url`. Writes `device_grants`. |
| POST | `/api/v1/cli/login/poll` | none | `{ device_code }` | `{ status:"pending" }` / `{ status:"slow_down" }` / `{ status:"complete", ingest_token, user:{handle} }` | On complete, mints `ingest_devices` row; raw token returned once. |
| GET | `/api/v1/devices` | session | — | `{ devices:[{id,label,last_used_at,status}] }` | Manage CLI devices. |
| DELETE | `/api/v1/devices/:id` | session | — | `{ ok:true }` | Revokes a device (`status='revoked'`). |
| **POST** | **`/api/v1/sync`** | **device** | aggregates payload (§6) | `{ accepted, days_upserted, cost_usd_total, profile_url, board_url }` | **Idempotent** via `Idempotency-Key` header; computes cost server-side. |
| **GET** | **`/api/v1/board`** | none/session | query params (§7) | ranked board JSON (§7) | Same endpoint serves web table and CLI (`?format=cli`). |
| GET | `/api/v1/profile/:handle` | none | — | profile + per-tool/model rollups + memberships (public only) | Public profile read; private memberships hidden unless `auth.uid()` matches. |
| POST | `/api/v1/communities` | session | `{ type, name, slug?, join_policy, visibility }` | `{ id, slug, join_code?, join_url }` | Creator auto-`owner` membership. Company type requires later domain verify. |
| **POST** | **`/api/v1/communities/:id/join`** | **session** | `{ code? }` | `{ joined, role, board_url }` | Open: no body. Code: `{code}`. email_domain: rejects → directs to verify flow. |
| POST | `/api/v1/communities/:id/leave` | session | `{}` | `{ ok:true }` | Deletes own membership. |
| GET | `/api/v1/communities/:id` | none/session | — | community meta + member count + your role | Private gated by membership. |
| POST | `/api/v1/verify/email/start` | session | `{ email }` | `{ sent:true, domain, expires_in }` | Validates domain (blocks disposable + `+` subaddressing), mints `email_verifications` (one 6-digit code), emails a magic link embedding that same code + shows the code as an OTP. |
| POST | `/api/v1/verify/email/confirm` | session | `{ domain, code }` (the link prefills `code`) | `{ verified:true, community:{id,slug}, joined:true, badge:"company" }` | Consumes the code (attempt-lockout + 15m TTL); auto-creates/joins the domain's company board; grants badge. |
| GET | `/api/auth/x` | session | — | 302 redirect | Begins X OAuth (badge/share only, not auth). |
| GET | `/api/auth/x/callback` | session | `?code&state` | 302 → settings | Upserts `linked_accounts(x)`; grants verified badge. |
| DELETE | `/api/v1/connections/x` | session | — | `{ ok:true }` | Disconnect X. |

### 3.1 `POST /api/v1/sync` (the most important)

Request:
```http
POST /api/v1/sync HTTP/1.1
Authorization: Bearer tbd_9f3c...e21
Idempotency-Key: 01J8Z9Q2K7X4M0N5R6V8B1C3D4
Content-Type: application/json
```
```json
{
  "client_version": "tokenboard-cli/0.4.1",
  "tz": "UTC",
  "records": [
    {
      "date": "2026-06-18",
      "tool": "claude-code",
      "model": "claude-opus-4-8",
      "input": 124500,
      "output": 38210,
      "cacheRead": 891200,
      "cacheCreate5m": 64000,
      "cacheCreate1h": 0
    },
    {
      "date": "2026-06-18",
      "tool": "cursor",
      "model": "gpt-5",
      "input": 22000,
      "output": 9100,
      "cacheRead": 0,
      "cacheCreate5m": 0,
      "cacheCreate1h": 0
    }
  ]
}
```
Aggregates only — never prompts, code, or paths. The wire shape is camelCase with the cache-write bucket **split** into `cacheCreate5m`/`cacheCreate1h` (they price differently — 1.25× vs 2×), matching the canonical contract in §6.3. Server resolves the bearer → `(user_id, device_id)`, computes `cost_usd` per row from the pinned LiteLLM table, then `INSERT ... ON CONFLICT (user_id, device_id, date, tool, model) DO UPDATE` (last-write-wins, idempotent). Response (compact view of the **canonical §6.3 envelope** — the server returns the full §6.3 shape; this is the subset the CLI surfaces):
```json
{
  "accepted": true,
  "days_upserted": 2,
  "cost_usd_total": 7.412300,
  "price_table_version": "litellm-2026-06-01",
  "profile_url": "https://tokenboard.sh/u/devon",
  "board_url": "https://tokenboard.sh/c/global"
}
```
> Note the **`cost_usd_total`** here is the *internal/diagnostic* sync value, returned at full `numeric(14,6)` precision on purpose — do **not** round it to 2dp. The 2-decimal rule applies only to the user-facing `cost` field on the board JSON and the UI (see §7.2 field semantics).

Replaying the same `Idempotency-Key` returns the stored `response_json` verbatim; reusing the key with a different `request_hash` returns `409 idempotency_key_conflict`. (The full wire payload with the four cache-bucket fields and the server processing order are specified in §6.)

### 3.2 `GET /api/v1/board`

The board endpoint and its **canonical** request + JSON contract are specified in **§7.2** (it is shared verbatim between web and CLI). The params there are authoritative: `community=<slug>` (omit or `global` for the global board), `window=7d|30d|all`, `metric=tokens|cost`, `me=<handle>`, `limit` (default 50, max 200), `format=json|cli`. In brief:

Request (web): `GET /api/v1/board?community=acme&window=7d&metric=cost&limit=50`
Request (CLI): `GET /api/v1/board?community=global&window=30d&metric=tokens&format=cli`

The compact shape below is the same data trimmed for illustration — **the canonical full contract is §7.2** (use `entries[]`/`me` from §7.2, not a separate shape):
```json
{
  "scope": "community",
  "community": { "slug": "acme", "name": "Acme Corp", "type": "company" },
  "window": "7d",
  "metric": "cost",
  "generated_at": "2026-06-19T04:00:00Z",
  "you": { "rank": 12, "handle": "devon", "value": 41.88 },
  "rows": [
    { "rank": 1, "handle": "kpatel", "display_name": "Kiran P.", "avatar_url": "https://...", "value": 318.04, "tokens": 51200000, "top_tool": "claude-code", "badges": ["company"] },
    { "rank": 2, "handle": "dvo",    "display_name": "Duy Vo",   "avatar_url": "https://...", "value": 287.61, "tokens": 47800000, "top_tool": "cursor",      "badges": ["company","x"] }
  ],
  "next_cursor": "eyJyYW5rIjo1MH0="
}
```
Private community boards require `session` + membership (else `403`); public/unlisted boards and the global board (`community=global`) are anonymous-readable. Served from Upstash Redis sorted sets; cache miss falls back to a windowed SQL aggregate over `usage_day` / `usage_day_total`.

### 3.3 `POST /api/v1/communities/:id/join`

Request (code board):
```http
POST /api/v1/communities/3b1f.../join HTTP/1.1
Cookie: <session>
Content-Type: application/json
```
```json
{ "code": "X7K2Q9" }
```
Response (success):
```json
{ "joined": true, "role": "member", "community": { "slug": "frontend-guild", "name": "Frontend Guild" }, "board_url": "https://tokenboard.sh/c/frontend-guild" }
```
Failure modes: wrong code → `403 invalid_join_code`; already a member → `200 { "joined": true, "already_member": true }`; company board (`join_policy='email_domain'`) → `409 { "error":"requires_email_verification", "verify_url":"/verify/email?community=..." }`.

---

## 4. Auth & Identity

This section specifies how tokenboard establishes identity, authenticates CLI devices, and keeps the two credential systems cleanly separated. The guiding principle is **value-first, login-to-claim**: a user sees their number before they ever authenticate, and authentication is the act of *claiming a public spot*, not a gate in front of the product.

### 4.1 Session-layer decision

**Decision: Supabase Auth (GoTrue) with the GitHub provider for the web, plus a separate hand-rolled device-token system for the CLI.** Identity lives in Supabase's `auth.users`; our app data hangs off it via a `public.users` profile row keyed 1:1 to `auth.users.id`.

Rationale:

- **Supabase Auth for the *web*** because it runs the entire GitHub OAuth 2.0 dance for us (state, PKCE, token exchange, the `auth.users` row), ships first-class Next.js App Router support via **`@supabase/ssr`** (cookie-based sessions, a middleware "proxy" that refreshes tokens), and — because the database and the auth system are the same platform — gives us **`auth.uid()` inside RLS for free** (see §2.2). We don't re-implement CSRF-safe OAuth, and we don't hand-roll a session store.
- **Sessions are Supabase-managed JWTs, and server-side revocation still works.** Supabase issues a short-lived access-token **JWT** (default ≤1h) plus a single-use rotating refresh token, both in an `HttpOnly` cookie (`sb-<ref>-auth-token`) via `@supabase/ssr`. Each access token's `session_id` claim maps to a row in `auth.sessions`, so we keep the *server-side revocation* tokenboard needs — ban for sybil abuse, privatize, force-logout — via `supabase.auth.admin.signOut(jwt, scope)` and `admin.updateUserById(uid, { ban_duration })`. **Caveat (load-bearing):** a ban/revoke is enforced on the *next token refresh*, not instantly; to kill a session immediately we call `admin.signOut` (deletes the `auth.sessions` rows) **and** keep the access-token TTL short. This is why we don't need a custom opaque-DB-session layer — Supabase already provides revocable sessions.
- **The CLI does NOT use Supabase sessions.** Supabase Auth is an OAuth *client/relying-party*, not an authorization server — it has **no RFC 8628 device grant** and no long-lived headless API token. So the CLI keeps its own **ingest token** (opaque, hashed at rest in `ingest_devices`) minted through our hand-rolled device-authorization claim flow (§4.3). The only change vs. an Auth.js design: the browser `/claim` "approve device" page resolves the **Supabase** session (`getUser()` / `getClaims()` via `@supabase/ssr`) to a `user_id` before binding the grant. Web and CLI stay separate credential types against the same identity.

```
                 ┌───────────────────────────┐
   Browser  ───▶ │ Supabase Auth (GitHub)    │ ──▶ auth.users + JWT cookie
                 └───────────────────────────┘   (sb-<ref>-auth-token, HttpOnly)
                                │ public.users.id = auth.users.id (1:1)
   CLI      ───▶ ┌───────────────────────────┐
                 │ device-claim → ingest_token│ ──▶ ingest_devices (hashed)
                 └───────────────────────────┘
```

### 4.2 GitHub OAuth 2.0 flow (web, via Supabase Auth)

**Supabase Auth runs the OAuth dance; we don't hand-roll it.** GitHub is configured as a social provider in the Supabase dashboard (Client ID + Secret from a GitHub OAuth App whose callback URL is `https://<project-ref>.supabase.co/auth/v1/callback`). The browser kicks off login with `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })`; Supabase (GoTrue) owns `state`, PKCE, the `code → token` exchange (the GitHub `client_secret` lives only in Supabase, never in our app), and writing the GitHub identity into `auth.users`. GitHub returns an already-verified primary email, so **no confirmation email is sent** on GitHub login (our only email dependency is the deliberate work-email verification via Resend, §5.3).

**Profile mirror.** On first login we ensure a `public.users` row keyed 1:1 to `auth.users.id` (a uuid FK, `on delete cascade`), populated by an `after insert` trigger on `auth.users`. This `public.users` row holds the app-facing profile (`handle`, `display_name`, `avatar_url`, `github_id`, `github_login`, `banned_at`) — Supabase's `auth.users` stays the identity system of record; we never duplicate auth fields. We still key dedup/bans on the **immutable `github_id`** (mirrored from the GitHub identity), never on mutable `login`.

**Sessions.** `@supabase/ssr` stores the access-token JWT + rotating refresh token in an `HttpOnly` cookie (`sb-<ref>-auth-token`); Next.js middleware refreshes them. **Server code authorizes with `supabase.auth.getClaims()` (verifies the JWT signature) or `getUser()` (revalidates against the Auth server) — never `getSession()`, whose cookie can be spoofed.**

**Numbered sequence:**

1. **Authorize** — User clicks "Sign in with GitHub." The client calls `signInWithOAuth({ provider:'github', options:{ redirectTo:'…/auth/callback' } })`; Supabase 302-redirects the browser to GitHub with `state` + PKCE it manages.
2. **Consent** — GitHub authenticates the user and shows the consent screen (we request only the default profile + email scopes; no `repo`/`org`).
3. **Callback** — GitHub redirects to Supabase's `/auth/v1/callback`, which validates `state`/PKCE, exchanges the code (server-to-server, with the secret), and creates the `auth.users` row + session, then redirects to our `redirectTo` route with a `code`.
4. **Code exchange** — Our `/auth/callback` route handler calls `supabase.auth.exchangeCodeForSession(code)`, which sets the `sb-<ref>-auth-token` cookie.
5. **Profile mirror** — The `after insert` trigger on `auth.users` (or our callback, idempotently) upserts the `public.users` row keyed on `auth.users.id`, recording `github_id`, `github_login`, `avatar_url`, `display_name`.
6. **Land** — Browser is redirected to the user's profile / the board they were claiming. They now appear publicly.

**ASCII sequence diagram:**

```
 User           Browser          tokenboard (Next.js)      Supabase Auth        GitHub
  │  click sign-in  │                    │                      │                  │
  │────────────────▶│ signInWithOAuth    │                      │                  │
  │                 │───────────────────────────────────────────▶│ build state+PKCE │
  │                 │           302 → github.com authorize       │─────────────────▶│
  │                 │◀───────────────────────────────────────────│                  │
  │   consent + approve                                          │                  │
  │────────────────────────────────────────────────────────────────────────────────▶│
  │                 │      302 → supabase /auth/v1/callback?code │                  │
  │                 │◀───────────────────────────────────────────────────────────────│
  │                 │                    │   code exchange (secret), create auth.users + session
  │                 │                    │                      │◀────────────────▶│
  │                 │   302 → /auth/callback?code=…              │                  │
  │                 │◀───────────────────────────────────────────│                  │
  │                 │ GET /auth/callback │ exchangeCodeForSession│                  │
  │                 │───────────────────▶│─────────────────────▶│ set sb-…-auth cookie
  │                 │ Set-Cookie: sb-…   │ trigger: upsert public.users (auth.users.id)
  │                 │◀───────────────────│                      │                  │
  │  see my profile │  302 → /me         │                      │                  │
  │◀────────────────│                    │                      │                  │
```

### 4.3 Value-first, login-to-claim CLI flow (the critical UX)

The CLI **never** prompts for login before showing value. `npx @tokenboard/cli` parses local logs and prints the user's number plus a *local-only* board immediately. Only when the user wants to appear on the public web board do we authenticate — and we do it via a **device-authorization-style claim**, because a CLI can't receive an OAuth redirect and we never want the user pasting tokens by hand.

**Phase A — local preview (no network identity, no login):**
1. `npx @tokenboard/cli` runs the local parser (first-party Claude Code parser + `ccusage` shell-out for the long tail).
2. It prints the aggregate (tokens/day/tool/model) and a **local board** (this machine's history), **always with a dollar figure** — tokens *and* `$`. Because the preview runs offline with no server, the CLI computes this `$` from a **pinned LiteLLM pricing snapshot bundled in the CLI release** and renders it as a labeled estimate (e.g. `~$1,180`). This snapshot is used **only** for the cosmetic preview estimate — it never feeds the leaderboard. Authoritative cost is still computed **server-side** on sync from the server's pinned table (§6.4 step 7), which is what ranks and what the board shows; the board self-corrects if the CLI snapshot has drifted (a new model, a stale pin), and `npx …@latest` refreshes the snapshot. So "counts in, cost out, server is truth for the board" holds — the client only produces a labeled local estimate.
3. Footer: `Sign in with GitHub to claim your spot → tokenboard claim`. No anonymous identity is created or persisted server-side.

**Phase B — claim (device flow → ingest token):**
1. CLI POSTs `/api/v1/cli/login/start` with `{ client_name, machine_hash }` (machine_hash = salted hash of a stable machine id, used only for "this device" labeling and de-dup, never PII).
2. Server creates a `device_grants` row: a `device_code` (long, secret, CLI-held), a short human `user_code` (e.g. `WXYZ-1234`), `expires_at` (~10 min), `interval` (poll seconds), status `pending`. Returns `{ device_code, user_code, verification_url, interval, expires_in }`.
3. CLI opens the browser to `verification_url` = `https://tokenboard.sh/claim?code=WXYZ-1234` and **also prints** the URL + code in case the browser can't open. CLI begins polling `/api/v1/cli/login/poll` with `device_code` every `interval` seconds.
4. In the browser, if the user has no web session they go through the **Supabase Auth GitHub flow (§4.2)** first. The `/claim` route handler then resolves the **Supabase** session server-side (`getUser()` / `getClaims()` via `@supabase/ssr`) to a `user_id`; the page shows the `user_code` for confirmation ("Approve device WXYZ-1234?") and they click **Approve**.
5. On approve, server binds the grant to the user: sets `device_grants.user_id`, status `approved`, and mints a **device/ingest token** — a random opaque secret returned to the CLI on its *next poll* (never shown in the browser). Server stores only `sha256(ingest_token)` in `ingest_devices` with `user_id`, `machine_hash`, `created_at`, `last_used_at`, `revoked_at`.
6. CLI's next poll returns `{ status: "complete", ingest_token }`. CLI writes it to **`~/.config/tokenboard/auth.json`** (mode `0600`, XDG-aware via `$XDG_CONFIG_HOME`; Windows `%APPDATA%\tokenboard\auth.json`) as JSON: `{ "token": "tbd_…", "userId": "<uuid>", "handle": "devon", "createdAt": "<iso8601>" }`. The `device_code` is now consumed. (The rolling sync watermark lives separately in `state.json` in the same dir.)
7. All future `tokenboard sync` calls send `Authorization: Bearer <ingest_token>`. The token resolves to `(user_id, device_id)`; ingestion is the idempotent upsert keyed `(user_id, device_id, date, tool, model)`. The token authorizes *ingest only* — it cannot read other users, manage communities, or act as a web session.

Polling responses follow the OAuth device-grant convention: `authorization_pending`, `slow_down`, `expired_token`, `access_denied`, then success.

**ASCII sequence diagram:**

```
 User        CLI (npx @tokenboard/cli claim)     tokenboard server          Browser+GitHub
  │  run claim   │                                 │                        │
  │─────────────▶│ POST /cli/login/start           │                        │
  │              │────────────────────────────────▶│ create device_grant    │
  │              │  {device_code,user_code,url}     │  status=pending         │
  │              │◀────────────────────────────────│                        │
  │              │ open browser → /claim?code=WXYZ-1234                      │
  │              │─────────────────────────────────────────────────────────▶│
  │              │ print "go to <url>, code WXYZ-1234"                       │
  │   (sees code)│                                 │   ┌── Supabase Auth GitHub (§4.2) if no session
  │              │                                 │◀──┘  → session cookie   │
  │              │  ── poll loop ──▶               │                        │
  │              │ POST /cli/login/poll(device_code)                        │
  │              │────────────────────────────────▶│ pending → "authorization_pending"
  │              │◀────────────────────────────────│                        │
  │  Approve WXYZ-1234 in browser                  │                        │
  │─────────────────────────────────────────────────────────────────────▶ │
  │              │                                 │ bind grant→user_id      │
  │              │                                 │ mint ingest_token,      │
  │              │                                 │ store sha256 only       │
  │              │ POST /cli/login/poll(device_code)                        │
  │              │────────────────────────────────▶│ approved                │
  │              │  { status:"complete",            │                        │
  │              │    ingest_token }                │                        │
  │              │◀────────────────────────────────│                        │
  │              │ write ~/.config/tokenboard/auth.json (0600)              │
  │  later: sync                                   │                        │
  │              │ POST /api/v1/sync  Bearer <token>│                        │
  │              │────────────────────────────────▶│ verify sha256, upsert  │
  │              │◀────────────────────────────────│ (user_id,date,tool,model)
```

Why device-flow and not a localhost redirect: a localhost callback works on a dev laptop but breaks over SSH, in containers, and on remote dev boxes — exactly where agentic-coding usage lives. The device/claim flow works everywhere a browser can be opened *somewhere*.

### 4.4 Credential types (keep these mentally separate)

| Credential | Holder | Storage | Revocable | Authorizes |
|---|---|---|---|---|
| Supabase session | Browser | access-token JWT + refresh token in `HttpOnly` cookie (`sb-…-auth-token`); session row in `auth.sessions` | Yes (`admin.signOut` deletes the `auth.sessions` row; effective on next refresh + short TTL) | Full web app as that user |
| Ingest/device token | CLI | `ingest_devices`, **sha256 only** | Yes (set `revoked_at`); also has sliding `expires_at` (bumped each sync, silent re-mint on cron) | Ingest aggregates only |
| GitHub `access_token` | — | Held by **Supabase Auth**, not by us | n/a (Supabase-managed) | Nothing we retain |
| Email verification | transient | `email_verifications`, **hashes only**, ~15m TTL | Expires | One-time company join |

### 4.5 Abuse / sybil considerations

The product is a public leaderboard, so the adversary's goal is **inflated rank** or **fake affiliation**. Usage numbers themselves are validated by server-side cost computation and plausibility caps on tokens/day; this section covers the *identity* attack surface per tier.

**Tier 1 — GitHub identity (sock puppets):**
- **Threat:** a user spins up many GitHub accounts to flood a board or fake a community.
- **Mitigations:** key everything on immutable **`github_id`** so deleting+recreating a username doesn't dodge bans; **plausibility caps** on ingested aggregates (max tokens/day per human) plus per-`machine_hash` de-dup so one device can't back ten accounts undetected; ban = `users.banned_at` **plus** `supabase.auth.admin.updateUserById({ban_duration})` + `admin.signOut()` to kill the user's Supabase sessions, and device tokens revoked (set `revoked_at`) — note the ban takes effect on next token refresh unless `signOut` deletes the session rows, so we pair it with a short access-token TTL (§4.1). (We deliberately do **not** gate public ranking on GitHub account age/signal — every signed-in user ranks immediately; the social/communities framing, not an eligibility filter, is the anti-cheat posture. See §4.6.)

**Tier 2 — community (slug squatting, invite abuse):**
- **Threats:** squatting desirable slugs (`/c/openai`); brigading with puppets; leaked join codes.
- **Mitigations:** **reserved-slug denylist** (company-looking names, trademarks, profanity) — squatting `openai` as a community is blocked; that namespace is reserved for verified company boards; join codes are **6-char, high-entropy, rotatable, and rate-limited**, and an admin can rotate the code or switch `join_policy` to `invite` if a code leaks; per-IP / per-account **rate limits on community creation**; communities are explicitly **lower-trust** in the UI (no verified badge), so squatting yields little.

**Tier 3 — company (fake domains, free-provider abuse):**
- **Threats:** verifying a domain you don't work at; creating a company board from a free/disposable provider; one person inflating a small company's board with puppets.
- **Mitigations:** **mailbox control is the gate**; **disposable + free-provider denylist** plus **MX-record requirement** to create a new domain board; **plus-subaddress + local-part normalization** stops one mailbox minting many "distinct" members; **org-admin claim + privatize** gives a real owner a cleanup lever; **re-verification (180d)** prunes stale/departed members. (We do **not** suppress small company boards below a member threshold — a freshly-verified domain board ranks immediately; mailbox control + normalization already bound the abuse, and the named-company social pressure is the point. See §4.6.)

### 4.6 Ranking eligibility (DECIDED: rank everyone, no eligibility gate)

**Decision: there is no "ranking-eligibility" gate. Every non-banned signed-in user, and every verified company board, appears on public boards immediately.** Earlier drafts proposed (a) quarantining low-signal/new GitHub accounts from public ranking until they passed an account-age + activity threshold, and (b) suppressing company boards below a minimum verified-member count. **Both are removed.**

Rationale:
- **The leaderboard is the product, and it must feel instant.** A new user who runs the CLI and claims a spot has to *see themselves ranked* in the same session — a quarantine that hides them "until N days old" guts the core loop and the share moment.
- **The real anti-cheat gate is social, not algorithmic.** Communities and company boards are "you vs people you actually know"; a sock-puppet on a friends/company board is self-policing in a way a global stranger-board never is. We lean on that, plus the already-specified `github_id`-keyed bans, plausibility caps, `machine_hash` de-dup, and (for company tier) mailbox control + normalization.
- **No schema to carry it.** Keeping this out means `users` needs no `ranking_eligible`/`eligible_at` column, `usage_day_total` needs no per-day `flagged` column governing ranking, and neither the §6.4 write path nor the §7 read path filters on eligibility — they `ZADD`/serve every non-banned user. The only ranking exclusion is `users.banned_at` (hard ban) and the §6.4-step-10 implausibility flag, which is **advisory/telemetry only** (it annotates a day; it does **not** remove that day's tokens from the score or hide the user).

The single source of "should this user/score appear publicly" is therefore `users.banned_at IS NULL`. No additional eligibility state exists.

---

## 5. Membership Tiers & Work-Email Verification

All three tiers are governed by a single principle: a board is "rank the members of a community over a window." The **individual** tier is simply a `users` row (no community row — an individual is their own profile/identity); the **community** and **company** tiers are rows in the `communities` table, differing only by `type`, `join_policy`, and `visibility`. Membership is the `memberships` join table `(user_id, community_id, role, joined_via, verified_via, ...)`.

### 5.1 Tier comparison

| | **Individual** | **Community** | **Company** |
|---|---|---|---|
| Representation | `users` row (no community row) | `communities.type='community'` | `communities.type='company'` |
| **Purpose** | "just you" — your profile/identity | friends, a Discord, a class, a team | everyone at a verified work domain |
| **Create flow** | Exists as soon as you sign in with GitHub. 1:1 with a user. | Any logged-in user clicks "Create community" → name + slug; becomes `owner`/`admin`. | Auto-materialized by the *first* successful work-email verification for that domain (§5.3), OR pre-seeded for known orgs. |
| **Join flow** | N/A (you are its only member) | Invite link (`/c/<slug>`) or **6-char join code**; `join_policy` is `open`, `code`, or (invite via code). | Auto-join on work-email verification for the matching domain. No code; the email *is* the join. |
| **Verification** | GitHub identity (tier-1) | None beyond GitHub login; trust is social / code-gated | Work-email domain control (tier-2, magic-link/OTP) |
| **Default visibility** | Public (it's your profile) | Public; creator may set `private` | **Public by default**; org-admin may privatize once claimed |
| **`verified_via`** | `github` | `code` / `invite` | `email:<domain>` |

The **verification ladder** is exactly two rungs: **tier-1 = GitHub** (you exist, you have an identity, you can appear on public boards and join communities) and **tier-2 = work email** (you additionally belong to a company board and earn a company badge). A user can sit on many boards at once: their individual profile (always), any communities they joined, and one-or-more company boards they verified into.

### 5.2 Domain → company-board mapping

- Each company board has a **unique `email_domain`** in `community_email_domains` (e.g. `acme-corp.com`). At most one company row per domain.
- **First-verifier-creates (with optional pre-seed):** when the first user verifies an email at a domain that has no company row, the server **creates** the company community (`type='company'`, `join_policy='email_domain'`, `visibility='public'`, slug derived from the domain), and that first verifier is added as a normal `member` — **not** auto-`admin` (prevents a random early employee from controlling the org board). Well-known orgs can be **pre-seeded** (name, logo, slug) so the board looks right on day one.
- **Admin claim:** org admin status is granted out-of-band — a later "claim this org" review (corporate signal or manual review). Until claimed, the company board runs with default settings; no individual can privatize it.

### 5.3 Work-email verification: start → confirm flow

GitHub never proves you work somewhere — so company membership requires proving control of a **mailbox at the company's domain** via a single 6-digit code, delivered both as a clickable magic link (link embeds the code) and as a paste-able OTP. This is a *separate, additive* verification on top of an existing GitHub session.

1. **Start** — Logged-in user enters a work email (we pre-fill the GitHub primary email as a *hint* only). `POST /api/v1/verify/email/start { email }`.
2. **Validate the address** before sending anything:
   - **Lowercase + normalize.** Extract `domain`.
   - **Block disposable domains** against a maintained denylist refreshed on a schedule. Reject with a clear message.
   - **Block plus-subaddressing**: strip/reject `+tag` (`devon+foo@acme-corp.com` → `devon@acme-corp.com`; if the normalized local-part is already pending/used, don't allow a second slot). The disposable/free-provider denylist also excludes `gmail.com`, `outlook.com`, etc. from forming company boards.
   - **Domain sanity**: must have an MX record (cheap DNS check) to be eligible to *create* a new company board.
3. **Mint the 6-digit code** — server generates **one** 6-digit code and stores `email_verifications (user_id, email, domain, code_hash, expires_at ~15m, attempts)`. Sends an email **via Resend** (see §9; `RESEND_API_KEY`, React-Email template) that contains the code **both** as a paste-able OTP **and** embedded in a magic link (`/verify/email/confirm?domain=…&code=…`) — the link and the OTP are the *same* code. Only the `code_hash` is stored. Security rests on attempt-lockout + 15m TTL + send/confirm rate-limits, not on code entropy (it's a 6-digit code, not a high-entropy token).
4. **Confirm** — user clicks the link (which prefills the code) or pastes the OTP. `POST /api/v1/verify/email/confirm { domain, code }`. Server checks `code_hash`, expiry, and attempt count (lock after ~5 tries).
5. **Bind** — on success: find-or-create the company community for `domain` (rules above), insert `memberships (user_id, community_id, role='member', verified_via='email:<domain>')`, set `reverify_due = now() + 180 days`, and grant the **company badge**. The raw email is **not** stored long-term — we keep `domain` + a salted hash of the full address (for re-verification de-dup), not the plaintext.

**Leaving / re-verification cadence:** email proof is point-in-time, so company memberships **expire** on a 180-day re-verification window (`reverify_due`). After expiry the member is moved to `lapsed` (hidden from the live board, not deleted) until they re-verify — this naturally drops people who've left without us needing HR data. Users can **leave** a company board manually at any time (removes the membership row, revokes the badge). If a domain's MX disappears or the company is dissolved, the board is frozen (read-only) rather than deleted.

**Privacy note on public company boards (DECIDED policy):** company boards **show the real company name/logo immediately** — the social pressure ("acme-corp.com is #3 this week") is the distribution engine — but this is sensitive, so the safety levers are: **alias-by-default for company-scoped rows** (a member's row on a company board defaults to a display alias, so individual identity isn't exposed without opt-in even though the company is named); a **fast self-serve emergency-privatize / takedown path** — any verified member (and, once claimed, the org admin) can flip `visibility='private'` (visible only to verified members of that domain) or request takedown in one click, effective immediately via DB-session revocation; individuals can always fully opt out by leaving the board while keeping their individual profile public; and we display only **aggregates and ranks**, never prompts/code/paths (those never leave the client anyway). This is *not* anonymize-until-claim. Residual risk: a company's aggregate spend trend is briefly public before anyone privatizes it — accepted as the cost of the distribution loop. (See `DESIGN.md` §7.2.)

**ASCII sequence diagram (verify):**

```
 User (logged-in)     Browser/CLI            tokenboard server            Mail
  │ enter work email      │                        │                       │
  │──────────────────────▶│ POST /verify/email/start {email}               │
  │                       │───────────────────────▶│ normalize+lowercase   │
  │                       │                        │ strip +subaddress     │
  │                       │                        │ deny disposable/free  │
  │                       │                        │ MX check (new domain) │
  │                       │                        │ store code_hash       │
  │                       │                        │ send OTP + magic link │
  │                       │                        │  (same 6-digit code)  │
  │                       │                        │──────────────────────▶│
  │  receive email        │                        │                       │
  │◀──────────────────────────────────────────────────────────────────────│
  │ click link / paste OTP│                        │                       │
  │──────────────────────▶│ POST /verify/email/confirm {domain,code}       │
  │                       │───────────────────────▶│ verify code_hash,expiry,attempts
  │                       │                        │ find-or-create company(domain)
  │                       │                        │ INSERT memberships     │
  │                       │                        │   verified_via=email:<domain>
  │                       │                        │ set reverify_due +180d │
  │                       │                        │ grant company badge   │
  │                       │  200 joined + badge     │ store domain+salted hash only
  │                       │◀───────────────────────│                       │
```

---

## 6. Sync Protocol

This section specifies the count-only data contract between the tokenboard CLI and the server, and the server-side ingestion pipeline.

> **Invariant — cost is never client-supplied.** The client uploads token *counts only*. The server computes USD cost from a pinned LiteLLM price-table version. This prevents clients from gaming the cost-ranked boards and lets us re-price historical data by replaying from `usage_day`.

### 6.1 What the CLI collects

The CLI is a stateless, side-effect-light Node binary run as `npx @tokenboard/cli` (or `tokenboard sync`). It reads **local agentic-coding logs only**, aggregates them, and uploads **counts** — never prompts, code, file paths, or repo names.

Two collectors feed one normalizer:

1. **Native Claude Code parser (first-party).** Reads the local Claude Code session logs (the JSONL transcript/usage records under the Claude Code config dir). For each assistant message we extract the `usage` block: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and the cache-creation buckets (ephemeral 5-minute and 1-hour TTL writes). We attribute each record to a local calendar day (the user's local TZ, captured once and sent as an offset) and to `tool = "claude-code"` plus the model id (e.g. `claude-opus-4-8`). **Dedup is global on `message.id`, first-occurrence-wins** (`requestId` is null on ~100% of assistant lines on disk, so the documented `requestId+message.id` key degenerates to `message.id` alone; the same id recurs within and across files from session resume — without global first-occurrence-wins dedup every total roughly doubles; see `DESIGN.md` §5.1).

2. **`ccusage` shell-out (long tail).** For tools we don't natively parse (Cursor, Codex CLI, Aider, Copilot CLI, Gemini CLI, etc.), the CLI shells out to `ccusage` (or the tool's own export) and reads its normalized JSON, mapping each tool's row into the same internal record shape. If `ccusage` is not installed, the CLI offers to `npx ccusage` on demand and degrades gracefully (Claude Code data still syncs).

Both collectors emit the same **normalized internal record**:

```
NormalizedRecord {
  date: "YYYY-MM-DD"   // local calendar day
  tool: string         // "claude-code" | "cursor" | "codex" | "aider" | ...
  model: string        // canonical LiteLLM model key, lowercased
  input: int
  output: int
  cacheRead: int
  cacheCreate5m: int    // ephemeral 5-min cache write tokens
  cacheCreate1h: int    // ephemeral 1-hour cache write tokens
}
```

Records are **summed locally** by the unique key `(date, tool, model)` before upload, so the payload has at most one row per day/tool/model. The server treats each upload as the authoritative *latest* aggregate for that key (upsert overwrites, not increment — see §6.4).

#### 6.1.1 The two collectors' real schemas (VERIFIED against `ccusage@20.0.14` + Claude Code logs)

The cache-creation field differs between our two collectors — this is **load-bearing** for the `cacheCreate5m`/`cacheCreate1h` split:

- **First-party Claude Code parser** — the raw JSONL `message.usage` block exposes the split directly: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and a nested `cache_creation: { ephemeral_5m_input_tokens, ephemeral_1h_input_tokens }`. Map these straight into `cacheCreate5m` / `cacheCreate1h` — accurate, because the two price differently (1.25× vs 2×).
- **`ccusage` shell-out** — `ccusage <source> daily --json --offline` returns `{ daily: [...], totals: {...} }` (same shape for every source: `claude`, `codex`, `opencode`, …). Each `daily[]` row has `date`, `inputTokens`, `outputTokens`, `cacheReadTokens`, **`cacheCreationTokens` (a single combined field — NO 5m/1h split)**, `totalCost`, and a per-model `modelBreakdowns: [{ modelName, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, cost }]`. **Map at the `modelBreakdowns` grain** (one `NormalizedRecord` per `(date, source, modelName)`), not the row total.

**Cache-bucket rule for ccusage tools:** since ccusage gives no split, put the combined `cacheCreationTokens` into `cacheCreate5m` and set `cacheCreate1h = 0`. This prices long-tail cache writes at the 5m rate (1.25×) — a small, documented approximation (most cache writes are 5m TTL anyway), and it only affects non-Claude-Code tools (Claude Code, the dominant source, keeps the exact split via the first-party parser). ccusage's own `cost`/`totalCost` fields are **ignored** — cost is always recomputed server-side (§6.4 step 7).

Discovery & robustness: invoke via `npx -y ccusage@20 <source> daily --json --offline` (pinned `@20`, never `@latest`); run each known source independently; on a per-source non-zero exit / parse failure, skip that source and continue (Claude Code data still syncs). `--offline` uses cached pricing — fine, since we ignore ccusage's cost anyway.

### 6.2 Model-key normalization

The CLI normalizes raw model strings to the canonical LiteLLM key space using a small embedded alias map shipped in the CLI **and** re-validated server-side. In practice ccusage@20 already emits near-canonical ids (verified: `claude-opus-4-8`, `claude-sonnet-4-6`), so the **MVP alias map is small** — pass through verbatim for the common case, alias only known divergent spellings, and lowercase. Unknown models are passed through verbatim; the server prices unknowns at `$0` and flags them for price-table backfill (the record is still stored so cost can be recomputed later).

### 6.3 Batching and the POST

- The CLI accumulates all normalized records since the last successful sync watermark (stored in `~/.config/tokenboard/state.json`: `lastSyncedAt`, `lastDaysUploaded[]`). Default window swept on each run: **last 35 days** (covers the 30d board plus slack; local Claude Code logs prune ~30d, so we sync eagerly).
- Records are chunked at **500 rows per request** to bound payload size; each chunk is an independent idempotent POST.
- Auth: `Authorization: Bearer <ingest_token>` (the device-bound token minted during `tokenboard claim`). **Local preview mode requires no token** and never calls `/api/v1/sync` — it renders entirely client-side.
- A per-request **`Idempotency-Key`** header (UUID/ULID, persisted with the chunk) lets the client safely retry without double-processing.

`POST /api/v1/sync`

Request headers:
```
Authorization: Bearer tbd_9f3c...e21
Content-Type: application/json
Idempotency-Key: 6f0c2e7a-1b3d-4f5a-9c21-7e0a2b4c6d8e
X-Tokenboard-CLI: 1.4.2
```

Request body — **counts only, no cost, no PII, no device id** (the server derives `device_id` from the bearer token, so a client can't spoof or merge another device's rows):
```json
{
  "tzOffsetMinutes": -420,
  "priceTableVersionSeen": "litellm-2026-06-01",
  "records": [
    {
      "date": "2026-06-18",
      "tool": "claude-code",
      "model": "claude-opus-4-8",
      "input": 184230,
      "output": 51890,
      "cacheRead": 2104880,
      "cacheCreate5m": 96120,
      "cacheCreate1h": 0
    },
    {
      "date": "2026-06-18",
      "tool": "claude-code",
      "model": "claude-3-5-haiku-20241022",
      "input": 12044,
      "output": 3380,
      "cacheRead": 88010,
      "cacheCreate5m": 0,
      "cacheCreate1h": 0
    },
    {
      "date": "2026-06-18",
      "tool": "cursor",
      "model": "claude-3-5-sonnet-20241022",
      "input": 60110,
      "output": 22740,
      "cacheRead": 410220,
      "cacheCreate5m": 18800,
      "cacheCreate1h": 0
    },
    {
      "date": "2026-06-19",
      "tool": "claude-code",
      "model": "claude-opus-4-8",
      "input": 90120,
      "output": 28110,
      "cacheRead": 1500400,
      "cacheCreate5m": 44020,
      "cacheCreate1h": 12000
    }
  ]
}
```

Response `200 OK`:
```json
{
  "accepted": 4,
  "rejected": 0,
  "priceTableVersionApplied": "litellm-2026-06-12",
  "daysAffected": ["2026-06-18", "2026-06-19"],
  "computed": {
    "totalCostUsdDelta": 5.7421,
    "totalTokens": 4720000
  },
  "flags": [
    { "code": "DAY_TOTAL_IMPLAUSIBLE", "date": "2026-06-18", "detail": "day total exceeds the DESIGN §9 plausibility ceiling; flagged not clipped, counts preserved" }
  ],
  "boardsTouched": [
    "lb:g:t:7d", "lb:g:t:30d", "lb:g:t:all",
    "lb:g:usd:7d", "lb:g:usd:30d", "lb:g:usd:all",
    "lb:c:91af:t:7d", "lb:c:91af:t:30d", "lb:c:91af:t:all",
    "lb:c:91af:usd:7d", "lb:c:91af:usd:30d", "lb:c:91af:usd:all",
    "lb:c:7d3e:t:7d", "lb:c:7d3e:t:30d", "lb:c:7d3e:t:all",
    "lb:c:7d3e:usd:7d", "lb:c:7d3e:usd:30d", "lb:c:7d3e:usd:all"
  ],
  "nextSyncSuggestedAfterSec": 3600
}
```

> **Canonical `/sync` response = the full envelope above (§6.3).** Implement this shape. The compact `{ accepted, days_upserted, cost_usd_total, profile_url, board_url }` block shown in §3.1 is just the subset the CLI surfaces to the user — it is **not** a second response variant; the server always returns the §6.3 envelope and the CLI reads the fields it needs.

Error envelope (validation, partial success):
```json
{
  "accepted": 0,
  "rejected": 2,
  "errors": [
    { "index": 0, "code": "NEGATIVE_COUNT", "field": "output" },
    { "index": 1, "code": "DATE_OUT_OF_RANGE", "field": "date", "detail": "older than 90d retention" }
  ]
}
```

### 6.4 Server-side processing (numbered, exact order)

1. **Authenticate.** Resolve the `Authorization` bearer → **`(user_id, device_id)`** via `ingest_devices.token_hash` (the matched row's `id` is the `device_id`). Reject `401` if absent, revoked (`status='revoked'`/`revoked_at` set), or expired (`expires_at < now()`); on a successful auth, bump `expires_at` forward (sliding window). (No anonymous sync path exists.) Compare the request's presented `machine_hash` to the one bound on the device row — a mismatch is **advisory only** (flag for detection / possible token-sharing or copy, do not hard-reject), since a legitimately re-imaged machine can shift its hash. The `device_id` scopes every write below, so multiple machines under one account accumulate rather than overwrite each other.
2. **Idempotency check.** Look up `Idempotency-Key` in `sync_requests`. If present and `request_hash` matches the canonicalized body, return the stored `response_json` verbatim (`200`) and stop; if present with a *different* hash → `409 idempotency_key_conflict`. Otherwise reserve the key (insert row with `status='processing'`).
3. **Schema-validate the payload.** Reject the whole request `400` on malformed JSON. Per-record validation: `date` matches `YYYY-MM-DD`; all six count fields are integers `>= 0`; `tool`/`model` are non-empty strings ≤ 64 chars. Invalid records are collected into `errors[]` and skipped (partial success).
4. **Clamp the date window.** Drop records with `date` older than the **90-day retention horizon** or in the future (relative to server UTC + the client `tzOffsetMinutes`, ±1 day grace). Skipped records → `DATE_OUT_OF_RANGE`.
5. **Normalize + re-validate the model key.** Re-apply the canonical alias map server-side (do not trust the client's normalization). **Canonicalize `tool` server-side** before anything keys on it — lowercase, trim, and map spelling variants to the single canonical form (e.g. `claude_code`/`ClaudeCode` → `claude-code`) so the `usage_day` PK can never split one tool across two spellings. Then resolve the canonicalized `tool` against the known-tools allowlist; unknown tools are accepted but tagged `tool_unverified=true`.
6. **Resolve the price table.** Load the **current pinned** LiteLLM price-table version (e.g. `litellm-2026-06-12`) from config/DB — *not* the client's `priceTableVersionSeen` (that field is advisory/telemetry only). Cache the table in process memory keyed by version.
7. **Compute cost server-side.** For each record:
   `cost = input*p.input + output*p.output + cacheRead*p.cache_read + cacheCreate5m*p.cache_write_5m + cacheCreate1h*p.cache_write_1h`
   where `p` is the per-token price for `(model)` from the resolved table. Unknown model ⇒ `cost = 0`, `priced=false`. Compute `tokens = input + output + cacheRead + cacheCreate5m + cacheCreate1h`.
8. **Idempotent upsert into `usage_day`.** One row per `(user_id, device_id, date, tool, model)`, using the `device_id` resolved in step 1. This is an **overwrite-on-conflict** upsert (the client always sends the full per-key aggregate for *this device*, so we replace that device's row, not add):
   ```sql
   INSERT INTO usage_day
     (user_id, device_id, date, tool, model, input_tokens, output_tokens, cache_read_tokens,
      cache_create_5m, cache_create_1h, tokens, cost_usd, price_table_version, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
   ON CONFLICT (user_id, device_id, date, tool, model) DO UPDATE SET
     input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens,
     cache_read_tokens=EXCLUDED.cache_read_tokens,
     cache_create_5m=EXCLUDED.cache_create_5m, cache_create_1h=EXCLUDED.cache_create_1h,
     tokens=EXCLUDED.tokens, cost_usd=EXCLUDED.cost_usd,
     price_table_version=EXCLUDED.price_table_version, updated_at=now();
   ```
   Overwriting *this device's* row is what keeps a re-sync idempotent; summing across devices happens in step 9. RLS plus the service-role write path ensure a sync can only write rows where `user_id` matches the resolved device owner.
9. **Recompute the cross-device day total.** For each affected `(user_id, date)`, recompute the **day total across ALL devices, tools, and models** and upsert it into `usage_day_total` — this is where a user's multiple machines combine:
   ```sql
   INSERT INTO usage_day_total (user_id, date, tokens, cost_usd, updated_at)
   SELECT user_id, date, SUM(tokens), SUM(cost_usd), now()
     FROM usage_day WHERE user_id=$1 AND date=$2 GROUP BY user_id, date
   ON CONFLICT (user_id, date) DO UPDATE SET
     tokens=EXCLUDED.tokens, cost_usd=EXCLUDED.cost_usd, updated_at=now();
   ```
   The Redis update uses this **new cross-device day-total** as the score for that day-bucket (idempotent overwrite via `ZADD` — see §7.3), so retries and multi-device syncs are both safe.
10. **Sanity-cap flag (flag, don't clip — advisory only).** After the `usage_day_total` rollup, compare each affected `(user_id, date)` total against the **derived plausibility ceiling** (the daily-throughput ceiling from `DESIGN.md` §9 — max plausible tokens/day including cache reads × 24h × N parallel agents). If a day total exceeds it, surface a `DAY_TOTAL_IMPLAUSIBLE` flag code in the response for **telemetry/abuse-detection only** — **do not clip or alter the stored counts, and do not exclude the day from ranking** (per §4.6 there is no eligibility gate; the only ranking exclusion is a hard `users.banned_at`). The flag is a signal for human review that can lead to a ban; it never silently changes a score. This keeps lifetime totals intact and auditable.
11. **Update Redis ZSETs.** For each affected day, write the per-day bucket score and refresh the rolling-window members (full algorithm in §7.3). All `ZADD`s use the user's immutable `user_id` (uuid) as member and the day-total (or window-total) as score — overwrites are inherently idempotent. Handle/avatar/tier are never stored in the ZSET; they're joined at read time from the profile cache by `user_id` (§7.5).
12. **Resolve the user's communities.** `SELECT community_id, slug FROM memberships WHERE user_id=$1` → update each community-scoped board key in addition to the global board. (A user is always a member of the global pseudo-community `g`.)
13. **Finalize idempotency record.** Update the `sync_requests` row with the full response JSON and `status='done'`. Return `200`.
14. **Bust caches.** Trigger ISR revalidation tags and CDN purge for the affected boards (see §8).

The DB writes in steps 8–12 run in a single Postgres transaction; Redis writes happen **after** commit (so a rolled-back DB never leaves phantom leaderboard scores). If a Redis write fails post-commit, it's enqueued for retry — Postgres remains the source of truth and Redis is fully rebuildable (§7.6).

**Why double-counting is impossible:** the underlying write is an idempotent `ON CONFLICT` upsert keyed on `(user_id, device_id, date, tool, model)`, so even a lost idempotency-ledger row cannot cause double counting *within a device*, and distinct devices write distinct rows that are summed (not overwritten) into `usage_day_total`. The `Idempotency-Key` layer exists for response consistency and cheap retries; the primary key is the true guard.

### 6.5 CLI commands, cadence & updates

**Commands** (collection/sync subset; the board-render commands — `top`, `board`, `me`, etc. — are specified in `DESIGN.md` §14.1):

| Command | Does |
|---|---|
| `npx @tokenboard/cli` | First-run hero path: local preview → prompt GitHub claim → first `sync`. |
| `tokenboard sync` | One-shot collect + POST `/api/v1/sync`. Silent-friendly (used by cron). |
| `tokenboard show-data` | **Dry-run** — prints the exact aggregate payload that *would* upload; no network. Trust unlock; ships before any upload path. |
| `tokenboard install` | Writes the recurring sync job (cron on Linux, launchd on macOS, Scheduled Task on Windows). |
| `tokenboard uninstall` | Removes the job + local config/token. |

**Cadence (two triggers, both call `sync`):**

1. **Scheduled** — `tokenboard install` registers a job running **`npx @tokenboard/cli@latest sync`** hourly. The job is written with a **stable per-machine minute offset** to avoid the `:00` thundering herd:
   ```cron
   # offset = hash(machineId) % 60  → e.g. 37
   37 * * * *  npx -y @tokenboard/cli@latest sync >/dev/null 2>&1
   ```
   (macOS uses a launchd plist with `StartCalendarInterval` at the same offset minute.)
2. **Manual** — `npx @tokenboard/cli` / `tokenboard sync` runs on demand and updates the board immediately.

Both paths hit the same idempotent ingest (§6.4), so a manual run between ticks just freshens the rolling window early; the next tick is a no-op if nothing changed. A long-offline machine catches its rolling window up on the next sync — lifetime totals never gap because Postgres is the system of record.

**No resident daemon.** We do not run an always-on process watching logs; hourly batch sync is sufficient and far less invasive.

**Client updates / distribution:**

- Published to **npm** as `tokenboard` (public). The cron and the recommended invocation use **`@latest`**, so scheduled users auto-update every run; `npm i -g` users are pinned until they update.
- **Keep the client dumb** so updates are rarely needed: *authoritative* cost computation, the pinned LiteLLM table for the **board**, ranking, and all board logic live server-side and update for everyone on deploy with zero client action. The one exception is a **read-only LiteLLM pricing snapshot bundled in the CLI** used solely to render the offline local-preview `$` estimate (§4.3) — it never feeds the board, and a stale snapshot only affects the labeled estimate (refreshed by `npx …@latest`). The CLI otherwise needs a new version only when a **local log format** changes (a tool's schema, or a new pinned `ccusage` major) or to refresh that snapshot.
- The CLI carries **`update-notifier`**: when a newer version exists it prints a one-line nudge (`⚡ tokenboard X available — run npx @tokenboard/cli@latest`) without blocking the current run.
- **`ccusage` is pinned internally to `@20`** (the JS→Rust v15→v20 rewrite was breaking — see `DESIGN.md` §5.2); we bump it deliberately, never float it.

### 6.6 The LiteLLM price table — sourcing, vendoring & versioning

Cost is computed server-side from a **vendored, pinned** copy of LiteLLM's per-token price map — never fetched live at request time.

- **Source of truth (upstream):** the single JSON file `model_prices_and_context_window.json` at the root of **`BerriAI/litellm`** (MIT-licensed). It's a flat object keyed by model id; per-model fields we use are `input_cost_per_token`, `output_cost_per_token`, `cache_read_input_token_cost`, `cache_creation_input_token_cost` (plus tiered `*_above_200k_tokens` / `*_above_272k_tokens` variants and `litellm_provider`). The first key `sample_spec` is a documentation template — **skip it** when parsing.
- **Pin to an immutable ref, do not hot-link `main`.** Upstream commits to this file **many times per day**, so fetching `…/main/…` at compute time is non-deterministic and unsafe. We pull from a specific commit SHA (or release tag): `https://raw.githubusercontent.com/BerriAI/litellm/<COMMIT_SHA>/model_prices_and_context_window.json`.
- **Vendor + version it.** Each pinned table is stored as a row/artifact identified by our own `price_table_version` string (e.g. `litellm-2026-06-12`), recording the upstream commit SHA, fetch timestamp, and a content hash. Every `usage_day` row stamps the `price_table_version` that priced it, so historical re-pricing is deterministic (replay `usage_day` against any version). At runtime the table is loaded by version and cached in process memory (the §8.1 in-process LRU).
- **Refresh via reviewed CI, never live.** A scheduled job (e.g. weekly) fetches the latest upstream SHA, diffs it against the current pinned copy, and opens a PR that bumps the SHA + vendored JSON + mints a new `price_table_version`. Merging the PR is the deliberate act that introduces new pricing; a merge triggers the §8.1 controlled background re-price (replay → recompute `cost_usd` → rebuild cost boards). Pricing never changes under us silently.
- **Unknown / missing models:** a model absent from the table (or missing a cost field) is priced at `cost = 0`, `priced = false`, and flagged for backfill — the raw counts are still stored so the row re-prices correctly once the table covers it (per §6.2 / step 7).
- **License:** MIT — retain the BerriAI copyright + MIT notice for the vendored file in `NOTICES.md`.

---

## 7. Leaderboards

Leaderboards are read-hot and rank-heavy. A Redis sorted set (ZSET) gives `O(log N)` writes and `O(log N + M)` top-M reads, plus `ZREVRANK`/`ZSCORE` for "your rank" in `O(log N)`. **Postgres remains the system of record; Redis is a derived, rebuildable index.**

### 7.1 Key scheme

Two metrics (tokens and cost) × three windows × scopes. We rank on **tokens by default** but keep a parallel cost board (the contract exposes both numbers; the score is the ranked metric).

```
# scope = g (global) or c:{community_id}
# metric = t (tokens, default ranked) or usd (cost)
# window = 7d | 30d | all
lb:{scope}:{metric}:{window}

# Global tokens, 7-day:                 lb:g:t:7d
# Community 91af tokens, all-time:       lb:c:91af:t:all
# Community 91af cost, 30-day:           lb:c:91af:usd:30d

# Per-day buckets (the source for rolling windows), one ZSET per (scope, metric, day):
lbday:{scope}:{metric}:{YYYY-MM-DD}
#   lbday:g:t:2026-06-19
#   lbday:c:91af:t:2026-06-19
```
Member = the user's **`user_id`** (the immutable uuid PK), never the `handle` — `handle` is a user-chosen vanity slug (per the `users` DDL it's mutable) and would orphan a member's scores on rename. This mirrors how communities are keyed by `community_id`, not `slug`. Handle, avatar, and tier are joined at read time from the profile cache by `user_id` (§7.5). Score = float (tokens are exact up to 2^53, well within float64 for realistic counts). For the **cost** (`usd`) boards the score is stored as **integer micro-dollars (USD × 1e6)**, not float dollars, so `ZUNIONSTORE`/`ZADD` sums stay exactly equal to the Postgres `numeric(14,6)` truth (no float-rounding drift); the API divides by 1e6 at read time.

> We key communities by **`community_id`** (immutable) in Redis, not `slug` (mutable), and members by **`user_id`** (immutable), not `handle` (mutable). The API maps `slug → community_id` before touching Redis. The `g` global board uses literal scope `g`.

### 7.2 The board JSON contract (CANONICAL — shared by web + CLI)

> **This is the single source of truth for `GET /api/v1/board`.** The rich shape below is canonical; every surface (web SSR table, `npx @tokenboard/cli`, the share-card renderer) consumes it. The web renders the full row (avatar, display name, tier pill, the tokens/cost toggle, sparkline); the **CLI renders only the subset a terminal can show** (rank, `@handle`, tokens, a delta arrow, an optional inline sparkline) and simply ignores the rest — or passes `?format=cli` to have the server omit the web-only fields (`avatar`, `displayName`, `tierPill`, `topTool`) for a smaller payload. Same contract, two response sizes. (DESIGN §14.4 references this section rather than redefining it.)

**Request:**
```
GET /api/v1/board?community={slug}&window={7d|30d|all}&me={handle}&metric={tokens|cost}&limit={n}&format={json|cli}
```
- `community` — community slug; omit or `global` for the global board.
- `window` — `7d` (default) | `30d` | `all`.
- `me` — optional caller handle; when present the response includes the caller's own rank even if outside the top-N.
- `metric` — `tokens` (default, the ranked metric) | `cost`.
- `limit` — top-N size, default `50`, max `200`.
- `format` — `json` (default, the full rich row) | `cli` (server omits the web-only fields the terminal can't render: `avatar`, `displayName`, `tierPill`, `topTool`). `--json` on the CLI still receives the full shape.
- Auth optional: public boards are readable unauthenticated (CDN-cacheable). Private company boards require a session whose memberships include the community.

**Response `200 OK`:**
```json
{
  "community": {
    "slug": "acme-corp",
    "name": "Acme Corp",
    "type": "company",
    "joinPolicy": "email_domain",
    "visibility": "public",
    "memberCount": 218
  },
  "window": "7d",
  "metric": "tokens",
  "generatedAt": "2026-06-19T09:14:02Z",
  "priceTableVersion": "litellm-2026-06-12",
  "windowStart": "2026-06-13",
  "windowEnd": "2026-06-19",
  "totalEntries": 218,
  "entries": [
    {
      "rank": 1,
      "handle": "devon",
      "displayName": "Devon Lee",
      "avatar": "https://avatars.githubusercontent.com/u/1029384?v=4",
      "tier": "company",
      "tierPill": { "label": "Acme Corp", "kind": "company", "verified": true },
      "tokens": 4218511,
      "cost": 38.42,
      "delta": { "rankChange": 2, "tokensChange": 612300, "pct": 17.0, "direction": "up" },
      "sparkline": [
        { "date": "2026-06-13", "tokens": 410220 },
        { "date": "2026-06-14", "tokens": 0 },
        { "date": "2026-06-15", "tokens": 988100 },
        { "date": "2026-06-16", "tokens": 720440 },
        { "date": "2026-06-17", "tokens": 511900 },
        { "date": "2026-06-18", "tokens": 1063960 },
        { "date": "2026-06-19", "tokens": 523891 }
      ],
      "topTool": "claude-code",
      "isMe": true
    },
    {
      "rank": 2,
      "handle": "devon",
      "displayName": "Devon Lee",
      "avatar": "https://avatars.githubusercontent.com/u/55512?v=4",
      "tier": "company",
      "tierPill": { "label": "Acme Corp", "kind": "company", "verified": true },
      "tokens": 3990187,
      "cost": 34.10,
      "delta": { "rankChange": -1, "tokensChange": -42000, "pct": -1.0, "direction": "down" },
      "sparkline": [
        { "date": "2026-06-13", "tokens": 600100 },
        { "date": "2026-06-14", "tokens": 580000 },
        { "date": "2026-06-15", "tokens": 410000 },
        { "date": "2026-06-16", "tokens": 700087 },
        { "date": "2026-06-17", "tokens": 600000 },
        { "date": "2026-06-18", "tokens": 700000 },
        { "date": "2026-06-19", "tokens": 400000 }
      ],
      "topTool": "cursor",
      "isMe": false
    }
  ],
  "me": {
    "inTopN": true,
    "rank": 1,
    "totalEntries": 218,
    "handle": "devon"
  }
}
```

**When the caller is outside the top-N**, `entries[]` holds the top-N only and `me` carries the caller's standalone row so both clients can render a pinned "— your position —" footer without a second request:
```json
"me": {
  "inTopN": false,
  "rank": 147,
  "totalEntries": 218,
  "entry": {
    "rank": 147,
    "handle": "devon",
    "displayName": "Devon Lee",
    "avatar": "https://avatars.githubusercontent.com/u/1029384?v=4",
    "tier": "individual",
    "tierPill": { "label": "GitHub", "kind": "individual", "verified": true },
    "tokens": 88120,
    "cost": 0.91,
    "delta": { "rankChange": 5, "tokensChange": 12000, "pct": 15.8, "direction": "up" },
    "sparkline": [ { "date": "2026-06-19", "tokens": 88120 } ],
    "topTool": "claude-code",
    "isMe": true
  }
}
```
`me` is `null` when `?me=` is absent or the handle has no rows in this board.

**Field semantics (load-bearing):**
- **`tokens`** = `input + output + cacheRead + cacheCreate5m + cacheCreate1h` — the all-in token volume, matching the ranked score. (Documented because "tokens" is ambiguous; this is the agreed definition and the CLI must label it the same way.)
- **`cost`** = server-computed USD at `priceTableVersion`; never client-sent. **Precision rule:** compute and store at full precision (`numeric(14,6)` per record; integer micro-dollars in Redis) and sum at full precision — **round to exactly 2 decimal places only at the display boundary** (the `cost` field in this board JSON, and all UI: `$640.00`, `$38.42`). Never round per-record before summing — a sub-cent record × thousands of records would drift the leaderboard total away from the user's real provider spend. So: full precision through all math → 2dp at the edge.
- **`tier`** ∈ `individual | community | company`; `tierPill.verified` reflects the verification ladder (GitHub = identity for `individual`; work-email domain proof for `company`).
- **`delta.direction`** ∈ `up | down | flat | new` (`new` when no previous-period snapshot existed).
- All `*Change` deltas are vs the **previous equal-length window** (previous 7d for the 7d board, etc.).

> The board JSON has two presentations in this document: the rich `entries[]`/`sparkline`/`delta` contract above is canonical for the web+CLI render path; the compact `rows[]` shape in §3.2 (`rank`, `handle`, `value`, `tokens`, `top_tool`, `badges`) is the same data trimmed for a paginated/cursor API response. Implementations should treat the rich contract as the superset.

### 7.3 Rolling windows: per-day buckets unioned

A naïve "7d board" decays continuously — yesterday's contribution must silently leave the window at midnight. You cannot express that with a single mutable ZSET without a sweep. We use the **daily-bucket** approach.

**Write side (on each sync, per affected day `D` and scope/metric):**
1. Write the authoritative day-total into the day bucket (idempotent overwrite; member = `user_id`, score = day-total):
   ```
   ZADD lbday:g:t:2026-06-19 4218511 9f3c1e21-...-uuid
   EXPIRE lbday:g:t:2026-06-19 3456000   # 40 days TTL (>30d window + slack)
   ```
2. **Incrementally** patch the rolling windows the day belongs to. A sync for day `D` only affects the `7d`/`30d`/`all` boards if `D` is within those windows of *today*. Rather than recompute a union on every write, we maintain each rolling board's member score directly:
   - Compute the member's new window total in SQL (cheap, indexed): `SELECT SUM(tokens) FROM usage_day_total WHERE user_id=$u AND date >= today-6` (7d) / `today-29` (30d) / no lower bound (all).
   - `ZADD lb:g:t:7d <sum7> $user_id`, `ZADD lb:g:t:30d <sum30> $user_id`, `ZADD lb:g:t:all <sumAll> $user_id`.

   This is exact and idempotent: the score is always the recomputed truth, so retries and out-of-order syncs converge. Cost is `O(1)` Redis writes + 3 small indexed Postgres aggregates per affected user.

**Decay side (the part a pure write-path can't do):** a member who *stops syncing* must still fall out of the 7d window as days roll over. A **daily sweep at 00:10 UTC** — triggered by an **Upstash QStash schedule** that POSTs to a signed Next.js route handler (`app/api/cron/leaderboard-sweep`) — recomputes the rolling windows for each active board scope via **ZUNIONSTORE over day buckets** (O(buckets), self-cleaning). QStash gives per-minute precision, automatic retries, and a DLQ on the Upstash account we already run; the route verifies the QStash signature and is idempotent (it `ZUNIONSTORE`s authoritative values), so a retried or double-fired sweep is safe:
```
# Rebuild the global 7d tokens board from the last 7 day-buckets:
ZUNIONSTORE lb:g:t:7d 7 \
  lbday:g:t:2026-06-13 lbday:g:t:2026-06-14 lbday:g:t:2026-06-15 \
  lbday:g:t:2026-06-16 lbday:g:t:2026-06-17 lbday:g:t:2026-06-18 \
  lbday:g:t:2026-06-19 \
  AGGREGATE SUM
EXPIRE lb:g:t:7d 172800
```
Missing day-buckets (a user didn't code that day) simply contribute nothing — the union over present keys yields the correct decayed total. The `all` board never decays (only written incrementally, never swept). The `30d` board unions 30 buckets.

**Why buckets-unioned over a continuous sweep of one big ZSET:** the union approach makes the day the atomic, immutable unit of truth. Re-pricing, backfills, late syncs, and Redis loss all reduce to "rewrite N day buckets, then re-union" — no read-modify-write races, and the windows are *defined* as a function of buckets rather than maintained by hand. The incremental write-path keeps boards fresh between sweeps; the nightly sweep guarantees correct decay even for users who go quiet.

### 7.4 Create-on-write + TTL

- Boards are **created lazily on first write** (`ZADD` creates the key). No board is pre-provisioned; a community with zero synced members simply has no Redis key and the API returns an empty board from a Postgres fallback.
- **TTLs:** day buckets `40d`; `7d` board `2d`; `30d` board `2d` (both rewritten nightly and on every sync, so the short TTL just garbage-collects abandoned community boards). The `all` board has **no TTL**. The nightly sweep re-`EXPIRE`s the windows it rebuilds.
- A board key going missing is never an error — reads fall back to Postgres and repopulate (§7.6).

### 7.5 Read commands

Top-N (the board page / CLI table):
```
ZREVRANGE lb:c:91af:t:7d 0 49 WITHSCORES   # top 50 with scores, highest first
```
"Your rank" (the caller, even if outside top-N), issued together in one `MULTI`/pipeline (the member is the caller's `user_id`):
```
ZREVRANK lb:c:91af:t:7d $user_id    # 0-based rank; null if absent
ZSCORE   lb:c:91af:t:7d $user_id    # the score
ZCARD    lb:c:91af:t:7d             # board size, for "X of N"
```
Handles, avatars, tiers, and deltas are **not** in Redis — they're joined from the Postgres-backed profile cache keyed by the returned `user_id`s.

**How the server assembles the board JSON:**
1. Map `slug → community_id`; resolve `scope` (`g` or `c:{id}`) and metric/window key.
2. `ZREVRANGE lb:{scope}:{metric}:{window} 0 {limit-1} WITHSCORES` → ordered `[user_id, score]`.
3. If `me` present: pipeline `ZREVRANK` + `ZSCORE` + `ZCARD` for the caller's `user_id`.
4. Batch-load profiles for all returned `user_id`s (+ caller) from the **profile cache** (Redis hash `prof:{user_id}` → handle, displayName, avatar, tier, top community pill) with Postgres fallback.
5. **Deltas:** compare current window score to the previous-period snapshot stored in `lbsnap:{scope}:{metric}:{window}` (a daily-frozen copy of the board taken by the same 00:10 QStash-triggered sweep, **before** it rebuilds `lb:*`). `rankChange` = previous rank − current rank; `tokensChange` = current − previous score.
6. **Sparklines:** one Postgres query `SELECT date, SUM(tokens) FROM usage_day_total WHERE user_id = ANY($ids) AND date BETWEEN windowStart AND windowEnd GROUP BY ...`, zero-filling missing days. This per-board query is cached (§8).
7. Serialize. The CLI consumes the identical JSON and renders an ASCII table; the web renders rows + sparkline SVGs + the next/og share card.

### 7.6 Rebuild from Postgres (Redis loss = non-event)

Redis holds no source data. Full rebuild for one board:
```sql
-- day buckets for the last 40 days, global tokens (member = user_id):
SELECT date, udt.user_id, SUM(udt.tokens) AS day_tokens
FROM usage_day_total udt
WHERE udt.date >= CURRENT_DATE - INTERVAL '40 days'
GROUP BY udt.date, udt.user_id;
```
A `rebuild` job streams these rows → `ZADD lbday:{scope}:t:{date} <day_tokens> <user_id>` per day → then runs the §7.3 sweep to materialize `7d`/`30d`/`all`. Community boards filter by `memberships`. The rebuild is idempotent and can run hot (it `ZADD`s authoritative values). A lightweight **drift check** runs nightly, sampling N users and comparing Redis window scores to the Postgres truth, alerting on mismatch.

---

## 8. Caching & Rate Limiting

### 8.1 Caching & invalidation

| Layer | What | Mechanism | TTL / Lifetime | Invalidation on sync |
|---|---|---|---|---|
| **CDN (Vercel Edge)** | Board JSON for **public** boards | `Cache-Control: public, s-maxage=30, stale-while-revalidate=300` + cache tag `board:{scope}:{metric}:{window}` | 30s fresh, 5min SWR | Tag purge for each board in `boardsTouched` (§6.3) |
| **CDN** | OG share-card images (`/api/og/...`, rendered by next/og) | Immutable URL keyed by `?handle&window&community&v={contentHash}` | `immutable, max-age=31536000` | New `v` hash on data change → new URL; old stays cached harmlessly |
| **ISR (Next.js App Router)** | SSR profile + board pages | `revalidate = 60` + `revalidateTag('board:{scope}:...')` and `revalidateTag('profile:{handle}')` | 60s | `revalidateTag(...)` called in sync handler step 14 for touched boards + the syncing user's profile |
| **Redis — leaderboard ZSETs** | Ranked scores | §7 keys | day buckets 40d; 7d/30d boards 2d; `all` none | Overwritten in-band on every sync (step 11); nightly sweep re-materializes |
| **Redis — profile cache** | `prof:{user_id}` hash (handle/name/avatar/tier/pill) | `HSET` | 6h | Busted when profile/membership changes; lazy refill on miss |
| **Redis — board-render cache** | Assembled `entries[]` payload per `(scope,metric,window,limit)` | `SET ... EX` | 30s | Deleted for touched boards on sync; otherwise expires fast |
| **Redis — previous-period snapshot** | `lbsnap:{scope}:{metric}:{window}` | Frozen ZSET copy | rolling, replaced nightly | Not sync-invalidated (intentionally a daily-frozen baseline for deltas) |
| **In-process (server)** | Pinned LiteLLM price table by version | LRU keyed by version string | until version bump | Immutable per version; new version = new key |

**Invalidation flow on a sync (step 14 expanded):**
1. Sync handler computes `boardsTouched` (global + each of the user's community boards × every window).
2. For each touched board: `DEL` the Redis render-cache key, then `revalidateTag('board:{scope}:{metric}:{window}')` (ISR) and edge cache-tag purge.
3. `revalidateTag('profile:{handle}')` for the syncing user (their numbers changed).
4. Bump the OG image `v` hash for that user's share cards (derived from their latest `(tokens, rank, window)`) so the X share card is never stale beyond one sync.

Because cost is computed server-side from a versioned price table and `usage_day` stores raw counts, a **price-table bump** triggers a controlled background re-price (replay `usage_day` → recompute `cost_usd` → rebuild cost boards) without any client involvement — and the cost board's CDN/ISR caches are purged the same way as a sync.

### 8.2 Rate limiting

Token-bucket limits enforced in Upstash Redis, keyed per-user (`uid:<id>`) and per-IP (`ip:<addr>`); the stricter remaining budget wins. All limited responses return `429` with `Retry-After` and `X-RateLimit-{Limit,Remaining,Reset}`.

| Endpoint | Per-user | Per-IP | Notes |
|---|---|---|---|
| `POST /api/v1/sync` | 60 / hour (burst 10/min) | 120 / hour | Keyed by device token → user; idempotent so retries are cheap. |
| `GET /api/v1/board` | 120 / min | 240 / min | Cached; anon limited by IP only. |
| `GET /api/v1/profile/:handle` | 120 / min | 240 / min | Public read, cached. |
| `POST /api/v1/communities` | 10 / day | 20 / day | Anti-spam on community creation. |
| `POST /api/v1/communities/:id/join` | 30 / hour | 60 / hour | Limits code brute-force; `+5s` penalty per failed code, lock after 10 fails. |
| `POST /api/v1/verify/email/start` | 5 / hour / email, 10 / hour / user | 20 / hour | Throttles email sends; one outstanding token per (user,domain). |
| `POST /api/v1/verify/email/confirm` | 10 / 15 min | 30 / hour | `attempts` column caps brute-force of the 6-digit code; invalidate after 5. |
| `POST /api/v1/cli/login/poll` | per `interval` (5s) | 60 / min | Device-flow polling respects returned `interval`; faster → `slow_down`. |
| OAuth callbacks | n/a | 60 / min | State+PKCE validated. |

**Idempotency (sync):** the CLI must send a stable `Idempotency-Key` (ULID) per sync attempt; retries of a failed/timed-out request reuse the same key. The server flow is specified in §6.4 (steps 2 and 13). Keys are retained 30 days, then GC'd. Because the underlying write is itself an idempotent `ON CONFLICT` upsert keyed on `(user_id, device_id, date, tool, model)`, even a lost ledger row cannot cause double counting — the idempotency layer is for response consistency and cheap retries; the PK is the true guard.

---

## 9. Tech-Stack Summary

| Component | Choice | Why |
|---|---|---|
| Hosting / runtime | **Vercel + Next.js (App Router)** | One platform for SSR pages, API route handlers, Edge CDN, and ISR tag invalidation; route handlers hold all business logic. |
| System of record | **Supabase (Postgres)** | Relational integrity for users/communities/memberships, the `usage_day` fact table, and idempotency ledger; the source every other store rebuilds from. Same platform as Supabase Auth, so identity (`auth.users`) and `auth.uid()` RLS are first-class. Authorization is server-layer-first with RLS as a backstop (§2.2). *Tradeoff vs Neon: free-tier projects pause after 7 days idle and need a manual restore — keep a warming ping or move to Pro ($25/mo) before launch.* |
| ORM / migrations | **Drizzle** | TypeScript-first, zero-dependency query builder that fits serverless cold starts; native `INSERT … ON CONFLICT` upserts (the idempotent sync write) and inline `sql\`…\`` window functions (the leaderboard's ranked aggregates) without leaving the typed layer; editable SQL migrations for hand-tuned leaderboard indexes; in-schema RLS via the `drizzle-orm/supabase` helpers when DB-enforced policies are wanted. |
| DB driver | **`postgres-js` via the Supabase pooler** | Drizzle over Supabase's Supavisor pooler (`prepare: false` in transaction-pool mode) for the hot path; service-role connection for trusted server writes. The Supabase client (`@supabase/ssr`) is used for the auth/RLS-enforced path. |
| Leaderboard / cache store | **Redis (Upstash)** | `O(log N)` ranked ZSET reads/writes for hot leaderboards; also hosts rate-limit buckets, profile cache, and previous-period snapshots. Derived & rebuildable. |
| Scheduled jobs | **Upstash QStash** | Cron-like schedules that POST to a Next.js route with per-minute precision, automatic retries, a DLQ, and signed delivery — on the Upstash account we already run (no Vercel Pro upgrade, no new vendor). Drives the nightly leaderboard sweep + snapshot (§7.3). |
| Web auth | **Supabase Auth (GoTrue) + GitHub provider** | Runs the GitHub OAuth dance, owns `auth.users`, issues cookie-based JWT sessions via `@supabase/ssr`; server-side revocation via `admin.signOut`/`updateUserById({ban_duration})`; gives `auth.uid()` RLS for free. No hand-rolled OAuth or session store. |
| CLI auth | **Hand-rolled device-authorization flow → ingest token** | A CLI can't receive an OAuth redirect; device flow works over SSH/containers/remote boxes where agentic coding lives. Token hashed at rest, ingest-only scope. |
| Cost computation | **Pinned LiteLLM price table (server-side)** | Counts in, cost out: clients can't game cost boards; versioned pinning enables deterministic historical re-pricing. |
| Local log parsing | **First-party Claude Code parser + `ccusage` shell-out** | First-party parser for the primary tool; `ccusage` covers the long tail (Cursor, Codex, Aider, Copilot, Gemini) with graceful degradation. |
| Share cards | **next/og** | Server-rendered OG images for X/social sharing; immutable content-hash URLs make them CDN-cacheable forever. |
| Email verification | **One shared 6-digit code (in both the magic link and the OTP), `code_hash` only** | Proves mailbox control at a work domain (the only credible signal of employment); security from attempt-lockout + 15m TTL + rate-limit (not code entropy), disposable/free-provider denylist. |
| Transactional email | **Resend** (`RESEND_API_KEY`, React-Email templates) | Sends the work-email magic link / OTP. First-class Next.js DX, perpetual free tier (~3k/mo, 100/day — ample for auth volume), no sandbox-approval gate, SPF/DKIM/DMARC on a verified sending domain. Sent from a server route handler. |
| Identity badge (X) | **X OAuth (connect-only)** | Verified badge + share affordance; deliberately *not* an auth provider — GitHub is the spine. |

---

## 10. Glossary

- **Agentic-coding tool** — a coding assistant that consumes LLM tokens (Claude Code, Cursor, Codex CLI, Aider, Copilot CLI, Gemini CLI, …). tokenboard ranks usage across these.
- **Board** — a ranked leaderboard: "rank the members of a community over a window." Always includes the global board plus individual/community/company boards.
- **`ccusage`** — a third-party tool the CLI shells out to for tools tokenboard doesn't natively parse; covers the long tail of agentic-coding tools.
- **Community (tier)** — the middle membership tier: friends/team/class boards, joined by open/code/invite. A `communities` row with `type='community'`. (Earlier drafts called this "group.")
- **Company (tier)** — a board for everyone at a verified work-email domain. A `communities` row with `type='company'` and `join_policy='email_domain'`; one per domain.
- **Day bucket** — a Redis ZSET `lbday:{scope}:{metric}:{date}` holding each member's authoritative token/cost total for one calendar day; the immutable unit rolling windows are unioned from.
- **Device-authorization flow / login-to-claim** — the CLI auth UX: start a grant, approve it in a browser (with GitHub OAuth), receive a device-bound ingest token. Works without a localhost redirect.
- **Idempotency-Key** — a client-supplied ULID/UUID per sync request enabling safe retries; the server replays the stored response on a matching key, returns `409` on a key reused with a different body.
- **Individual (tier)** — the base tier: a single GitHub identity = a `users` row (no `communities` row). Your public profile.
- **Ingest token** — the opaque, hashed-at-rest CLI credential (`ingest_devices.token_hash`) authorizing *ingest only*; sent as `Authorization: Bearer tbd_<token>`.
- **LiteLLM price table** — a version-pinned per-token price table the server uses to compute `cost_usd` from uploaded counts. Pinning enables deterministic re-pricing.
- **Local preview** — Phase A of the CLI: parse local logs and print your number with no network identity, no login, no server write.
- **Membership / `verified_via`** — a `(user_id, community_id, role)` row; `verified_via` records how membership was proven (`github` / `code` / `invite` / `email:<domain>`).
- **Price-table version** — the identifier (e.g. `litellm-2026-06-12`) stored on each `usage_day` row recording which table priced it; a bump triggers controlled background re-pricing.
- **Profile cache** — Redis hash `prof:{user_id}` (handle, display name, avatar, tier, pill) joined onto leaderboard members (`user_id`) at read time; Postgres-backed, lazily refilled.
- **Rolling window** — `7d` / `30d` / `all` ranking horizons computed by unioning day buckets (with a nightly sweep for correct decay) plus incremental write-path freshness.
- **Scope** — `g` (global) or `c:{community_id}`; the first segment of a Redis board key.
- **Session cookie** — the Supabase-managed web credential: an access-token JWT + rotating refresh token in an `HttpOnly` cookie (`sb-…-auth-token`), backed by an `auth.sessions` row; revocable server-side via `admin.signOut` (the reason a stateless-only JWT wasn't enough).
- **System of record** — Postgres. Every leaderboard/cache value is derivable from it; Redis loss is recoverable by rebuild.
- **Tier pill** — the badge shown on a board row indicating a member's tier (`individual` = GitHub, `community`, `company` = verified work domain).
- **`usage_day`** — the core fact table, one row per `(user_id, device_id, date, tool, model)`; idempotent overwrite-upsert on sync (per device); holds server-computed `cost_usd`. Cross-device totals live in `usage_day_total`.
- **`usage_day_total`** — per-`(user, date)` rollup across all tools/models; source for rolling-window sums and sparklines.