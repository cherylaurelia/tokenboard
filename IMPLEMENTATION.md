# tokenboard — Implementation Spec (agent-facing)

This is the **build sheet** for coding agents. It states *what to build, in what
order, and how to know it's done*. It is deliberately terse; for the *why* behind
any decision, follow the `ARCH §x` links to `ARCHITECTURE.md` (the canonical design)
or `DESIGN §x` to `DESIGN.md` (product). Where this file and prose disagree, **the
frozen contracts in this file win** — they are the de-duplicated source of truth.

> Read first: `CLAUDE.md` (repo rules — commit authorship, Conventional Commits, no
> personal identifiers in code/docs). Those are mandatory and override defaults.

---

## 1. Stack (DECIDED — do not re-litigate)

| Layer | Choice | Notes |
|---|---|---|
| Runtime/host | **Next.js (App Router) on Vercel** | SSR pages + `/api/v1/*` route handlers hold all business logic. |
| Database | **Supabase (Postgres)** | System of record. Free tier pauses after 7d idle → keep a warming ping or go Pro before launch. |
| ORM / migrations | **Drizzle** (`postgres-js` via Supabase Supavisor pooler, `prepare: false`) | Native `ON CONFLICT` upserts + inline `sql\`\`` window fns. |
| Web auth | **Supabase Auth (GoTrue) + GitHub provider**, cookie JWT via `@supabase/ssr` | `getUser()`/`getClaims()` server-side; never `getSession()` for authz. ARCH §4.1–4.2 |
| CLI auth | **Hand-rolled device-authorization flow → ingest token** | Supabase has no RFC 8628; keep custom. ARCH §4.3 |
| Leaderboard/cache | **Upstash Redis** (sorted sets) | Derived, rebuildable from Postgres. ARCH §7 |
| Scheduled jobs | **Upstash QStash** | Signed POST to a Next route; drives the nightly sweep. ARCH §7.3 |
| Cost source | **Vendored, commit-pinned LiteLLM price table** | Never hot-link `main`. ARCH §6.6 |
| Email | **Resend** | Work-email magic-link/OTP only. ARCH §5.3 |
| Local parsing | **First-party Claude Code parser + `ccusage` shell-out** | ARCH §6.1 |
| Share cards | **next/og** | ARCH §8.1 |
| npm package | **`@tokenboard/cli`** (published); installed bin name is `tokenboard` | Bootstrap is `npx @tokenboard/cli`. |

---

## 2. Frozen contracts (build to these exactly)

### 2.1 `GET /api/v1/board` — CANONICAL: **ARCH §7.2**
- Params: `community=<slug|global>`, `window=7d|30d|all`, `metric=tokens|cost`, `me=<handle>`, `limit` (default 50, max 200), `format=json|cli`.
- Response: the rich `entries[]` shape in §7.2 (`rank, handle, displayName, avatar, tier, tierPill, tokens, cost, delta{rankChange,tokensChange,pct,direction}, sparkline[{date,tokens}], topTool, isMe`) + a `me` object.
- **One contract.** Web renders the full row; CLI renders the subset (`rank, @handle, tokens|cost, delta arrow, optional sparkline`) and ignores the rest, or sends `format=cli` so the server omits `avatar/displayName/tierPill/topTool`.

### 2.2 `POST /api/v1/sync` — CANONICAL response: **ARCH §6.3 envelope**
- Request body: count-only camelCase records, cache-write split into `cacheCreate5m`/`cacheCreate1h`. ARCH §6.3.
- Headers: `Authorization: Bearer tbd_<token>`, `Idempotency-Key: <ULID>`.
- Server processing order is **exact** — follow ARCH §6.4 steps 1–14 in order.
- The compact block in §3.1 is the CLI-surfaced subset, **not** a second shape.

### 2.3 Data model — **ARCH §2.1 DDL is authoritative**
- `public.users.id` is a uuid **FK to `auth.users(id)` on delete cascade** (1:1 profile mirror; populated by an `after insert` trigger on `auth.users`). No custom `sessions` table — Supabase owns `auth.sessions`.
- `usage_day` PK = `(user_id, device_id, date, tool, model)` — device in the key so multiple machines **sum**, not overwrite. `usage_day_total` is the per-`(user,date)` cross-device SUM.
- Cost columns are `numeric(14,6)`.

### 2.4 Cost precision (ARCH §7.2 field semantics)
Compute/store/sum at **full precision** (`numeric(14,6)`; integer micro-dollars in Redis). **Round to exactly 2 decimals only at display** (board JSON `cost` + UI). Never round per-record before summing.

### 2.5 Auth model
- Primary authz = **server layer** (resolve Supabase session → `user_id`, scope Drizzle queries in code). RLS is **defense-in-depth** (auto-enforced only on the Supabase-client/PostgREST path). ARCH §2.2.
- `service_role` connection = BYPASSRLS, server-only, never browser. Used for ingest/auth-callback/email-confirm/leaderboard writes after authorizing `user_id` in code.

---

## 3. Build order (phases — each ships independently)

> Suggested sequence; each phase has a clear "done" gate. Commit per Conventional
> Commits, one logical change per commit.

1. **Repo scaffold** — Next.js App Router + TS, Drizzle config (`postgres-js`, `prepare:false`), Supabase project, Upstash Redis + QStash, env wiring (§4). Drizzle schema from ARCH §2.1 + first migration. *Done: `migrate` applies clean; `auth.users` trigger creates a `public.users` row on signup.*
2. **CLI local preview (no network)** — `npx @tokenboard/cli` parses Claude Code logs + shells out to `ccusage`, prints number + local board. *Done: prints correct aggregates offline; no identity created.* (See OPEN #3/#5 before finalizing the ccusage adapter + alias map.)
3. **Web auth** — Supabase Auth GitHub login, `@supabase/ssr` cookie middleware, profile mirror. *Done: sign in with GitHub → `public.users` row + session cookie; `getUser()` resolves server-side.*
4. **CLI claim (device flow)** — `device_grants` + `ingest_devices`, `/cli/login/start` + `/poll`, browser `/claim` reads Supabase session. *Done: `tokenboard claim` mints a device-bound ingest token, hash-only at rest.*
5. **Sync ingest** — `POST /api/v1/sync` with the exact §6.4 pipeline (auth → idempotency → validate → clamp → normalize → price → upsert → rollup → flag → Redis → caches). *Done: idempotent (replayed key → stored response); cost computed server-side; multi-device sums.*
6. **Leaderboard read** — Redis ZSET writes (§7.3) + `GET /api/v1/board` assembling §7.2 JSON; nightly QStash sweep + snapshot. *Done: top-N + your-rank correct; decay correct after a day rolls over; rebuildable from Postgres.*
7. **Web board + profile pages** — render §7.2; tokens/cost toggle; sparklines; share card via next/og. *Done: matches the prototypes in `prototypes/`.*
8. **Communities + work-email verify** — create/join (code), company boards via Resend magic-link/OTP (§5.3). *Done: domain auto-join; 180d re-verify.*
9. **Rate limits + caching** — Upstash token buckets (§8.2), CDN/ISR tags (§8.1). *Done: limits enforced; board JSON CDN-cached + tag-purged on sync.*

---

## 4. Environment / secrets to provision

`DATABASE_URL` (Supabase pooler, `?prepare=false` semantics), `DIRECT_URL` (migrations),
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`UPSTASH_REDIS_REST_URL` + `_TOKEN`, `QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY` + `_NEXT_SIGNING_KEY`,
`RESEND_API_KEY`, GitHub OAuth App (Client ID/Secret in Supabase dashboard; callback `https://<ref>.supabase.co/auth/v1/callback`),
`APP_ENCRYPTION_KEY` (encrypt `linked_accounts.access_token`), `HASH_PEPPER` (machine/email-hash salt),
`PRICE_TABLE_SHA` (pinned LiteLLM commit). Co-locate functions + DB in one region (e.g. `iad1`).

---

## 5. Must-test pure functions (test-after is fine, but these are non-negotiable)

Token-count correctness is the #1 trust risk — these are pure, deterministic, and a bug
ships everyone a wrong number. Write tests for them regardless of overall test posture:

- **Claude Code parser dedup** — global first-occurrence-wins on `message.id` (totals roughly **double** without it). ARCH §6.1, DESIGN §5.1.
- **Cost computation** — `(counts, price_table) → cost`, incl. the 5m (1.25×) vs 1h (2×) cache-write buckets; unknown model → cost 0, `priced:false`. ARCH §6.4 step 7.
- **Leaderboard window/decay math** — day-bucket union for `7d`/`30d`; a member who stops syncing falls out of the window. ARCH §7.3.
- **Board JSON schema** — responses validate against the §7.2 shape.

Everything else: integration-test against real (local/branch) Supabase + Redis; snapshot the web UI + terminal render. Don't mock external services into unit tests.

---

## 6. Open decisions that block specific code (resolve before the phase that needs them)

| # | Blocks phase | Question | Lean |
|---|---|---|---|
| 2 | 4 (claim) | CLI credential file path + format (`credentials` vs `auth.json`) | `~/.config/tokenboard/auth.json`, `0600`, JSON `{token,userId,handle,createdAt}` |
| 3 | 2 (collect) | Real `ccusage <source> daily --json --offline` output → `NormalizedRecord` map; does it expose the 5m/1h cache split? | capture real payload, document field map |
| 4 | 2 (preview) | Local-preview cost: ship a CLI price snapshot, or tokens-only pre-auth? | **tokens-only pre-auth** ($ after sync; keeps client dumb) |
| 5 | 2 (collect) | Embedded model/tool alias map contents | seed from #3 capture (claude-code, codex, opencode) |

RESOLVED already: stack (§1), `/board` + `/sync` contracts (§2), no ranking-eligibility gate (ARCH §4.6), cost precision (§2.4), npm name, LiteLLM sourcing (ARCH §6.6).

---

## 7. Hard rules (from CLAUDE.md — enforced)

- Commits: sole author per `CLAUDE.md`; **Conventional Commits**; no AI attribution/co-author.
- **No real personal names/emails/employer** in code, comments, docs, or mockups — use fictional placeholders (`devon`, `acme-corp.com`).
- Client uploads **counts only** — never prompts, code, file paths, or repo names.
