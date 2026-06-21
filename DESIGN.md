# tokenboard — Design Doc

> **Single source of truth (product).** This document is canonical for *what* we're building and *why*. Decisions here are *decided*, not open for re-litigation. Open questions are flagged in §15. For the technical *how* — SQL DDL, API endpoints, OAuth + device + work-email sequence diagrams, sync protocol, Redis key scheme — see the companion **`ARCHITECTURE.md`**.

---

## 1. Overview & Positioning

**tokenboard** (tokenboard.sh) is a public consumer web product.

**One-liner:** *See who's burning the most tokens.* — with the supporting line *Race your friends, not strangers.*

(Voice notes: lead blunt and literal — it reads like a great CLI README. The ownable hook is **"group chat" / "your friends, not strangers"** — keep that phrase in heavy rotation since no competitor can copy it. Do **not** define the product by another product, e.g. the rejected *"Cursor profiles, but ranked."*)

tokenboard aggregates your agentic-coding **usage and spend** across every tool you use (Claude Code first, then the long tail), turns it into a **public vanity profile**, and ranks it on **leaderboards** — but the core unit isn't a global board of strangers, it's a **community you and your friends create**. You vs your friends, this week, on tokens burned.

### The gap we're filling

The space already proved the primitives work. What it hasn't proven is *distribution* and *social pull*. Here's the landscape and exactly where each one stops short:

| Prior art | Has | Missing | Lesson |
|---|---|---|---|
| **tokscale.ai** | Global board, custom Rust parser, 35+ clients | No X traction, board-of-strangers | The tech is feasible; **distribution is the actual gap** |
| **viberank** | Public profiles, share cards | No communities, no rivalry loop | Profiles alone don't compound |
| **ccclub** | Groups | No profiles, no vanity layer | Groups without identity don't spread |
| **Cursor profiles** | Usage + a card | **No rank** | A number with nobody to beat is a dashboard, not a game |
| **Amazon internal `claude-leaderboard`** | curl\|bash install, hourly cron, aggregate-only | Internal-only, single tool | The *inspiration*: proves aggregate-only is enough and people love a board |

**Our wedge:** the *fusion* nobody has shipped — multi-tool usage + public profiles + **rank** + **user-created communities**, distributed **natively on X**. Cursor has the card but no rank. tokscale has the rank but no friends and no distribution. We have all four, and the community is the thing that makes it spread.

---

## 2. Core Thesis — Communities > Global Board

A single global leaderboard is the obvious build and the wrong one. The defensible product is **user-created communities** ("rooms"): a small named group — your team, your friend group, your bootcamp cohort, your Discord — racing each other.

This isn't a nice-to-have. It's the mechanism that fixes the three hardest problems a usage-board faces:

- **Cold-start.** A global board is dead until it has thousands of users; a community is *alive at N=3*. You don't need the world — you need three friends and a group chat. Every community is a **fresh mini-launch** with its own built-in audience (the people already in it). The product scales as a swarm of tiny launches, not one big one.
- **Anti-cheat by social context.** On a global board, a stranger inflating numbers is invisible and demoralizing. In a 5-person room where everyone *knows* each other's real stack, a faked number is socially obvious and self-policing. The community is a trust boundary.
- **Retention.** "You're #47,000 globally" is a number you check once. "You dropped to #4 in your room and Dana passed you" is a reason to come back tomorrow. Rivalry with people you know is the retention engine; rivalry with strangers is a novelty that decays.

The global board still exists — it's a fun ceiling and an aspirational backdrop — but it is **not** the product. The product is *your room*. The community is the viral unit.

---

## 3. User Flows

### 3.1 The "Appear Before You Sign Up" onboarding

The mantra: **PREVIEW → HOOKED → CLAIM.** You see your real number *locally* before you create anything; GitHub login is the step — taken while you're already hooked — that puts you on the public board. There is **no permanent anonymous public presence** (§7): the only pre-auth state is the local preview.

```
  $ npx @tokenboard/cli
  ─────────────────────────────────────────────
  scanning ~/.claude/projects ...        ✓ 1,207 sessions
  computing aggregate usage ...          ✓
  you burned 4.2B tokens · ~$1,180 this month   ← LOCAL preview, no login

  ┌─ if it were live, you'd rank ─────────────┐
  │  #3  in a typical 8-person room            │   ← teaser, computed locally
  └────────────────────────────────────────────┘

  → claim your spot + see your community:
    sign in with GitHub →  tokenboard.sh/claim/7f3a
  ─────────────────────────────────────────────
```

1. **Preview (~30s, no login).** `npx @tokenboard/cli` harvests local usage and renders your number — and a *local* teaser board — **right in the terminal**, before any account exists. This is the dopamine hit and it happens first. Nothing is uploaded yet.
2. **Hooked.** You see your real burn, beautifully rendered (§14). The CLI's call to action: *"Sign in with GitHub to claim your spot & see your community."*
3. **Claim → appear.** Click through → GitHub OAuth (one click for devs) → a device token binds to your account, your previewed history uploads, you pick a vanity URL, get the **verified badge**, and now you're on the **public** board and can create/join communities.

> Login is never a gate in front of *value* — the value (your number) shows first, locally. Login is the gate in front of *appearing publicly*, which is exactly where we want maximum captured identity.

### 3.2 Create / Join a community

**Create:**
1. Authenticated user clicks **New Room**, names it (e.g. `the-boys`), picks public/unlisted.
2. Server mints a community with a slug (`tokenboard.sh/community/the-boys`) and an **invite link**.
3. Creator is auto-added as first member with `role='owner'` (ownership lives in the membership, not an `owner_id` column).

**Join:**
1. Open an invite link → if logged in, one-click join; if not, sign in with GitHub (after the local `npx @tokenboard/cli` preview), then join. Company boards instead auto-join on **work-email verification** (§7.2).
2. On join, your existing `usage_day` history backfills the room's windowed leaderboard (you don't start at zero — you start with your real numbers).

### 3.3 The X share loop (numbered)

1. You hit a milestone or just want to flex — your profile or room renders an **OG flex card** (`next/og` / Satori) at a crawlable URL.
2. You click **Share** → a client-side `x.com/intent/post` link opens, pre-filled with text + the card URL. **$0 — no API call, ever.**
3. The card posts to X as a rich link unfurl (large image). Your followers see your number, your rank, and your room.
4. A friend sees it, thinks *"I burn way more than that,"* clicks through, runs `npx @tokenboard/cli`, and **appears** on the board.
5. They don't want to be in *your* room as a guest — they spin up *their own* room and pull *their* friends. **The loop closes and forks.** Every share is a potential new mini-launch.

---

## 4. Architecture

Two surfaces, one system of record:

- **CLI (`npx @tokenboard/cli`)** = the *install / harvest* surface. Runs on your machine, reads local logs, uploads **aggregates only**.
- **Web (Next.js on Vercel)** = the *view / share* surface. SSR profile and community pages for SEO and crawlable share targets; `next/og` Satori cards.

The split matters because of a hard constraint: **agent logs prune.** Claude Code keeps roughly a rolling ~30-day window on disk. The client therefore only ever *sees* a window. **The server is the system of record** — it accumulates daily aggregates **forever**, so your lifetime total survives long after the local logs that produced it are gone.

```
  ┌──────────────────────────── YOUR MACHINE ────────────────────────────┐
  │  npx @tokenboard/cli                                                  │
  │    ├─ Claude Code parser (OURS) ── ~/.claude/projects/**/*.jsonl      │
  │    └─ ccusage (shell out, source-first) ── 14 other tools             │
  │        `ccusage <source> daily --json --offline`                      │
  │                    │                                                  │
  │            normalized records {tool,model,4 token buckets,ts}         │
  │            `tokenboard show-data`  ← dry-run, prints exact upload     │
  └────────────────────────────────┬──────────────────────────────────────┘
                                    │  HTTPS  (aggregates only — no prompts,
                                    │          no code, no paths)
                                    ▼
  ┌──────────────────────────── VERCEL / NEXT.JS ─────────────────────────┐
  │  Ingest API  ── idempotent upsert into usage_day                      │
  │  Cost engine ── LiteLLM price table (pinned), 4 buckets, server-side  │
  │  SSR pages   ── /user/[handle]  /community/[slug]  (crawlable, SEO)   │
  │  next/og     ── Satori OG flex cards                                  │
  └───────────┬──────────────────────────────────────┬────────────────────┘
              │                                        │
              ▼                                        ▼
  ┌──────────────────────┐                ┌───────────────────────────────┐
  │ Postgres (Supabase)  │                │ Upstash Redis                 │
  │ + Supabase Auth + RLS│                │ sorted sets (ZSET)            │
  │ SYSTEM OF RECORD     │   read models  │ windowed leaderboards         │
  │ accumulates FOREVER  │ ─────────────► │ create-on-write, TTL keys     │
  │ users, linked_accts, │                │ (7d / 30d / all per scope)    │
  │ communities, members,│                │                               │
  │ usage_day            │                │                               │
  └──────────────────────┘                └───────────────────────────────┘
```

**Stack, named:**
- **Next.js on Vercel** — SSR for crawlable profile/community pages (SEO + share-target unfurls); `next/og` Satori for share cards.
- **Supabase (Postgres + Supabase Auth + RLS)** — durable system of record; Supabase Auth runs GitHub login and owns sessions.
- **Upstash Redis sorted sets** — windowed leaderboards, created on write with TTL keys (cheap, ephemeral, recomputable from Postgres).

Postgres is **truth**; Redis is a **fast, disposable read model** for ranking. If Redis is lost, leaderboards rebuild from `usage_day`.

### 4.1 Sync cadence — "always ongoing" without a daemon

The board *feels* live but is not real-time streaming; it's a **scheduled batch sync**. Two independent triggers, both of which just call `sync`:

- **Hourly background cron** (the "always ongoing" feel). `tokenboard install` writes a per-machine cron / launchd job that runs `npx @tokenboard/cli@latest sync` silently every hour. Set once, forget — the board moves throughout the day without the user touching anything. (This is the model the internal Amazon `claude-leaderboard` proved.)
- **Manual run** (`npx @tokenboard/cli` or `tokenboard sync`) updates the board *at that moment* — useful right after a big session, or before screenshotting.

**They never conflict.** Whichever fires first wins; the other is a harmless overwrite, because ingest is **idempotent** (re-syncing a day *sets* the row, never adds — §6 / `ARCHITECTURE.md` §6). A manual run between cron ticks just means a fresher number sooner; the next tick is a no-op if nothing changed. Because the server is the system of record, a machine that's been offline for days simply catches up its rolling window on the next sync — no gaps in lifetime totals.

> **No always-on daemon.** We deliberately avoid a resident process watching your logs continuously — it's heavier, creepier, and unnecessary. Hourly is plenty for a leaderboard.

**Cron jitter (required at scale):** the `install` job picks a **stable per-machine minute offset** (e.g. `minute = hash(machineId) % 60`) so 5k machines don't all sync at `:00`. Flattens the load to ~constant req/s (see §13).

### 4.2 Client updates — server is smart, client is dumb

`tokenboard` is published to **npm** (`npm publish`, public). How a user gets updates depends on how they run it:

| Invocation | Auto-updates? |
|---|---|
| `npx @tokenboard/cli@latest …` (and the cron uses this) | ✅ fetches newest published version every run |
| `npx @tokenboard/cli` (unpinned) | ⚠️ may reuse npx's cached copy — can drift |
| `npm i -g tokenboard` | ❌ pinned until manual `npm update -g` |

**Design consequence — keep the client dumb so it rarely *needs* updating.** All product logic (cost computation, the pinned LiteLLM price table, ranking, leaderboard rules, board rendering data) lives **server-side**; the web dashboard therefore updates for *everyone* the instant we deploy, with zero client action. The CLI only needs a new version when a **local log format** changes (a tool bumps its schema, or we pin a new `ccusage` major) — rare. When it happens:

- the cron's `@latest` and anyone using `@latest` pick it up automatically next run;
- everyone else sees an **`update-notifier`** nudge — *"⚡ tokenboard 1.3 available (you're on 1.1) — run `npx @tokenboard/cli@latest`"*.

We pin **`ccusage@20`** *internally* so their releases never silently break our parsing, while letting **our own** client float to `@latest` via the cron. Net: the dashboard is always current; the CLI stays current for cron/`@latest` users and politely nags the rest.

### 4.3 Design language — monkeytype *restraint*, our own color

The whole product — web dashboard *and* CLI — borrows monkeytype's **restraint** (dark, calm, monospace-forward, muted-until-meaningful) but uses **our own brand color**, not monkeytype's. This isn't decoration; it's the brand, and it's load-bearing for a tool whose distribution *is* screenshots. monkeytype is the canonical example of a tool developers find beautiful, and that exact crowd is our audience — but we take the *discipline*, not the hex.

**The accent: muted clay coral `#cc785c`.** A warm, desaturated coral — elegant, "expensive," and explored against ~10 alternatives (neon/lime/magenta read "vibecoded"; amber `#e2b714` would clone monkeytype outright). It reads warm like the layout was designed around, pairs naturally with the dark near-black base, and is Claude-adjacent without being a third party's literal brand color. The reference is the chosen prototype `prototypes/dashboard/index.html` (elevated/refined dark, Space Grotesk + IBM Plex Mono).

**Palette (dark, the default):**
- bg `#0c0c0e` · surfaces `#161618`/`#1a1a1d` · hairlines `#232327`/`#2c2c31`
- text `#ececee` → muted `#a4a4ac` → `#6f6f78` → `#4d4d55`
- **accent `#cc785c`** (dim `#a85c43`); on light mode the accent-as-text darkens to `#b3624a` for contrast
- movement signals kept muted: up `#6f9e78`, down `#a87070`
- A **light mode** exists (warm off-white `#f4f3ee`, *not* stark white) via a `data-theme` toggle.

**Principles:**
- **Dark, calm, grotesk UI + mono numbers (the browserarena recipe).** **Space Grotesk** for all UI text — wordmark, nav, titles, labels, *and* handles (techy, distinctive, not a vibecoded all-mono wall). **IBM Plex Mono** for the **numbers only** — tokens, ranks, %, the big OG figure — so data reads "technical benchmark." (Earlier drafts used JetBrains Mono + Inter; superseded by Space Grotesk + IBM Plex Mono.) The CLI board mirrors this feel in the terminal.
- **Minimal chrome, content-dense.** No heavy shadows, no decorative gradients, no clutter. The data *is* the design — ranks, big numbers, sparklines. Flat surfaces, hairline dividers.
- **Muted-until-meaningful color.** ~90% of the UI is grayscale; the coral accent appears *only* where it means something — the YOU row, your rank, key numbers. Avatars are neutral grey (not a rainbow); all sparklines are muted grey **except** the YOU row's coral one. The accent pops *because* everything else is quiet.
- **Calm motion.** Subtle, fast, functional transitions. Nothing bouncy.
- **One visual identity across surfaces.** The CLI board (§14) and the web board + OG share card share the palette, the Space-Grotesk-UI / IBM-Plex-Mono-numbers type split, coral accent, and the "muted-until-meaningful" rule, so a terminal screenshot and a web screenshot are visibly the same product.

> **Reference prototype:** `prototypes/dashboard/index.html` (light/dark via ◐). Its type recipe is adapted from browserarena.ai (grotesk UI + mono numbers).

> Tooling note: build the web app with **shadcn** (via the `vercel` plugin) on a **custom theme keyed to `#cc785c`**, **Space Grotesk** (UI) + **IBM Plex Mono** (numbers), + the palette above — not the default shadcn look, which reads as generic-AI. Reference prototype: `prototypes/dashboard/`.

---

## 5. Usage Counting — the HYBRID decision

> This was the one genuinely open question, framed as: *building the counting core myself vs. depending on `ccusage` (the "aura loss" of leaning on someone else's tool).* It is now **decided.**

**VERDICT: HYBRID — write our own Claude Code parser (the hero tool), shell out to `ccusage` for the 14-tool long tail (15 incl. Claude Code), and compute cost server-side from LiteLLM pricing. Ship it.**

### 5.1 Honest difficulty table (from on-disk evidence)

| Tool | Difficulty | Effort to ccusage-parity | The killer edge case |
|---|---|---|---|
| **Claude Code** | 7/10 | ~1–2 wks (naive but *wrong* in ~1 day) | **GLOBAL `message.id` dedup with null `requestId`.** On disk, `requestId` is absent on ~100% of assistant lines, so ccusage's documented `requestId+message.id` key degenerates to `message.id` alone. That id repeats ~2× *within* files (1427/1993) **and** recurs across files (170/613) from session resume. No dedup ⇒ you roughly **double every total**. Silent and credibility-destroying. |
| **Codex** | 7/10 | 3–6 days *(0 days of value now — no session data on disk)* | **Cumulative vs. delta.** `info.total_token_usage` is a running session total; summing every `token_count` line double-counts quadratically with turn count. Take last/max total per session, or sum disjoint `last_token_usage` deltas. Also: `cached_input_tokens` is a *subset* of `input_tokens`, not additive. |
| **Gemini** | 8/10 | N/A retroactively; ~2–4 wks forward-looking | **Nothing on disk by default.** Usage is in-memory (`/stats`), lost on exit. Telemetry is opt-in OTEL only. You can't recover history, and "cost" is often genuinely $0 (free Code Assist tier) or tier-dependent (>200k context reprices). You'd build OTEL plumbing for data that mostly doesn't exist. |

**The pattern is decisive:** Claude Code is the only tool where (a) the data actually exists on the machine, (b) it's our primary tool, and (c) the build cost is bounded. Codex has no data yet; Gemini has no data *by design*. Building those parsers now is writing tests against fixtures for usage that doesn't exist.

### 5.2 The HYBRID path — and the exact seam

**Own:** the Claude Code parser. Primary tool (~1207 files of real data on disk now), best-documented format, bounded build, and the one place wrong numbers publicly embarrass us.

**Depend:** `ccusage` for the ~14-tool long tail (Codex, Gemini, Goose, Amp, Qwen, Copilot CLI, etc.). Let ryoppippi absorb the several-releases-per-week maintenance tax for formats users rarely touch.

```
                    ┌─────────────────────────────────────────┐
   Claude Code  →   │  OUR parser (Rust/TS)                   │
   JSONL transcripts│  • global message.id dedup              │ ─┐
                    │  • skip synthetic/error/non-asst        │  │
                    └─────────────────────────────────────────┘  │
                                                                  ▼
                    ┌─────────────────────────────────────────┐  ┌──────────────────┐
   14 other tools → │  ccusage CLI (shell out, CLIENT-SIDE)   │  │ Normalized usage │
                    │  `ccusage <source> daily --json         │ ─┤ record (OUR      │
                    │            --offline`                   │  │ schema)          │
                    │  e.g. `ccusage codex daily --json …`    │  └────────┬─────────┘
                    │  ingest stdout JSON                     │           │
                    └─────────────────────────────────────────┘           ▼
   (both run on the USER's machine; the server                ┌──────────────────────────┐
    ingests POSTed JSON and NEVER spawns ccusage)             │ Cost engine (server-side)│
                                                              │ LiteLLM price JSON +      │
                                                              │ offline snapshot,         │
                                                              │ 4 buckets + 1h/5m cache   │
                                                              └──────────────────────────┘
```

**Seam decisions, exactly:**

1. **The integration boundary is the CLI/JSON line, not a library import — and it runs CLIENT-SIDE only.** As of v20 (current `ccusage@20.x`, ~89% Rust), ccusage ships as a thin JS launcher (`./src/cli.js`) that spawns a per-platform precompiled native binary via `optionalDependencies` (`@ccusage/ccusage-{darwin,linux,win32}-{arm64,x64}`). There is **no importable JS parser** — the `exports` map (incl. the old `ccusage/data-loader`) was **removed in the v20 rewrite** (it existed through v15; do not plan to import it). So we **shell out to the CLI and ingest stdout**. Critically, ccusage reads **local per-machine files** (`~/.claude`, `~/.codex`, …), so it must run on the **user's machine inside our CLI**; the **server never spawns ccusage** — it only ingests the POSTed JSON. **Pin the major** (`ccusage@20`) in the client collector — the v15→v20 (JS→Rust) rewrite was a breaking change to this surface. The process boundary insulates us from ccusage's internal churn; we depend on its **output contract**, not its internals.

   > **Syntax note:** v20 is **source-first** — `ccusage <source> <period> [flags]`, e.g. `ccusage claude daily --json --offline`, `ccusage codex daily --json --offline`. Sources: `claude, codex, opencode, amp, droid, gemini, copilot, qwen, …`; periods: `daily/weekly/monthly/session/blocks`. `--offline` uses cached pricing (good for cron). Only `--mode display` is confirmed in the v20 README — **verify `--mode calculate`/`auto` against the installed binary** before relying on it (we compute cost server-side regardless, so this only affects ccusage's own cost column, which we ignore).

2. **Both paths emit OUR normalized record.** Our parser and the ccusage adapter both produce the same shape:
   ```
   { tool, model, input, output, cacheRead, cacheCreate5m, cacheCreate1h, ts, costUSD }
   ```
   Downstream (the board) never knows which path a row came from.

3. **Compute cost server-side, in ONE place, for BOTH paths.** There is **no `costUSD` on disk** for Claude Code, and pricing has **4 buckets** that price differently (cache-read ~0.1×, cache-write 1.25× for 5m / 2× for 1h TTL — all confirmed). Don't trust ccusage's cost number and don't hand-maintain a table. **Vendor the LiteLLM `model_prices_and_context_window.json`, ship an offline snapshot, and run our cost engine over raw token counts from both paths.** One consistent cost methodology across all 15 tools — removes *"did ccusage and my parser price differently?"* as a whole class of bug. (tokscale, ccusage, and us all converge on LiteLLM as the pricing oracle — reinventing the *price table* is the genuinely dumb move; reinventing the *parser* for the hero tool is the smart one.)

4. **License: zero risk.** ccusage and LiteLLM are both MIT. Depending on the npm/binary package satisfies attribution automatically. If we vendor the LiteLLM JSON, drop the MIT notice in a `NOTICES` file. That's the whole obligation. **Crediting ccusage publicly is also the aura-positive move — do it.**

**Don't:** fork-and-maintain ccusage wholesale (inherits a several-per-week treadmill). **Don't:** build all 15 from scratch (the wasted-effort trap; tail maintenance is a part-time job with zero differentiation).

---

## 6. Data Model

Postgres, with Row-Level Security. The server is the **system of record** — it accumulates daily aggregates forever, independent of the client's ~30-day rolling visibility window.

| Table | Key columns | Purpose / rationale |
|---|---|---|
| **users** | `id`, `handle` (vanity), `github_id`, `github_avatar_url`, `email`, `verified_badge`, `created_at` | Identity. `handle` is the vanity-URL namespace. |
| **linked_accounts** | `id`, `user_id`, `provider` (`github`/`x`), `provider_handle`, `cached_payload`, `linked_at` | **Separate table on purpose.** X is one cached read at connect time, stored here, removable without a migration. Keeps optional/volatile providers off the core `users` row. |
| **communities** | `id`, `slug`, `name`, `visibility` (`public`/`unlisted`), `created_by`, `created_at` | A "room." `slug` → `tokenboard.sh/community/[slug]`. `created_by` records who made it; **ownership lives in `memberships.role='owner'`**, not a column here. |
| **memberships** | `community_id`, `user_id`, `role` (`owner`/`admin`/`member`), `joined_at` | Many-to-many user↔community. `owner` is the creator/controlling member. |
| **ingest_devices** | `id`, `user_id`, `token_hash`, `label`, `status`, `created_at` | One row per claimed machine. The device's `id` is the `device_id` in `usage_day`, so a user's laptops accumulate (§7.3). |
| **usage_day** | **PK (`user_id`, `device_id`, `date`, `tool`, `model`)**, `input`, `output`, `cache_read`, `cache_create_5m`, `cache_create_1h`, `cost_usd`, `updated_at` | The atom of usage. One row per device/day/tool/model. |
| **usage_day_total** | **PK (`user_id`, `date`)**, `tokens`, `cost_usd` | Cross-device rollup = `SUM` over all of a user's devices/tools/models that day. The leaderboard score source. |

**Idempotent upsert (the load-bearing decision).** Because the client only ever sees a rolling window and re-uploads overlapping ranges every run, ingestion **must** be safe to repeat. The composite PK `(user_id, device_id, date, tool, model)` + `INSERT ... ON CONFLICT DO UPDATE` makes a device re-uploading the same day a no-op rather than a double-count — while *different* devices write *different* rows that sum into `usage_day_total` (§7.3) instead of clobbering each other. The client can run as often as it likes; the server stays correct.

**Server accumulates forever.** Once a `usage_day` row lands, it's permanent — even after the source logs prune off the user's disk. Lifetime totals are a `SUM` over `usage_day` (across all the user's devices), never dependent on what's currently on any machine.

**`cost_usd` is computed server-side** by the cost engine (§5.2) at ingest time and stored on the row, so leaderboards never recompute pricing at read time.

---

## 7. Auth & Identity

**GitHub OAuth is primary and MANDATORY to appear on a public board.** It's the right identity for a developer audience, gives us a real avatar for the board for free, and `github_id` is a strong, stable anti-sock-puppet anchor. We require it (rather than allowing permanent anonymous users) to **maximize captured identity** — every public row is a real, claimable account. **Email magic-link is the fallback** for people who won't OAuth, and is *also* the mechanism for company-board membership (§7.2).

> **Value-first, not login-first.** Requiring GitHub does *not* mean a login wall at the door. `npx @tokenboard/cli` first renders a **local preview** (your number + a local board) with **no login**, *then* prompts *"Sign in with GitHub to claim your spot & see your community."* Order is **appear → hooked → claim** (§3.1). The login happens while the user is already hooked, not before they've seen value. There are **no permanent anonymous public users** — the local preview is the only pre-auth state.

Board rows show **GitHub avatars** — recognizable faces are what make "you vs your friends" legible at a glance.

### 7.1 Membership tiers (two `communities` rows + the individual profile)

**Community and Company share the `communities` table** (two `type` values: `community` and `company`), differing only by `type` + `join_policy` + `visibility`. The **Individual tier is just the `users` row + public profile** — *not* a `community_type` enum value (the enum is `community | company` only) and not a `communities` row at all. So we don't build three systems: one `communities` table with a verification strategy per room, plus the bare user profile for individuals. (Full schema + flows in `ARCHITECTURE.md`.)

| Tier | What it is | Join / verification | Default visibility |
|---|---|---|---|
| **Individual** | Just you, your GitHub identity + vanity profile | GitHub OAuth (verification tier 1) | public profile |
| **Community / Group** | Anyone creates one; friends join | invite link or 6-char code (`join_policy: open` / `code`) | unlisted or public |
| **Company** | An org board that auto-groups verified employees | **work-email domain** magic-link/OTP (verification tier 2) → `@acme-corp.com` proves mailbox control → auto-join + 🏢 badge | public (org-admin can privatize) |

**Verification ladder:** tier 1 = **GitHub** (who you are), tier 2 = **work email** (which company you're in). No SAML, no WorkOS — a public consumer product wants the lightweight magic-link path, not enterprise SSO.

### 7.2 Work-email (company) verification

1. User clicks **Join `<company>`** → enters `you@company.com`.
2. Server emails a **magic link / 6-digit code**; clicking it proves mailbox control.
3. Auto-add to the company community + grant the 🏢 verified-company badge.
4. **Block disposable domains** (`@mailinator.com`, etc.) and **`+`-subaddress tricks**; rate-limit verification attempts.

Company boards are **public by default** ("Stripe vs Ramp, who burns more tokens" is exactly the X-native content). **DECIDED policy** (not anonymize-until-claim): we **show the real company name and logo immediately** — the recognizable brand *is* the distribution — paired with two safety levers: (1) **alias-by-default for company-scoped rows** — on a company board a member's row defaults to a display alias, so individual identity isn't exposed without opt-in even though the company is named; and (2) a **fast self-serve emergency-privatize / takedown path** — any verified member (and, once claimed, the org admin) can flip the board to private or request takedown in one click, taking effect immediately via DB-session revocation. **Residual risk:** a company's aggregate spend trend is briefly public before anyone privatizes it; we accept this as the cost of the distribution loop, mitigated by the one-click privatize lever.

### 7.3 Multi-device — combining usage across machines

A user has many machines (work laptop + personal laptop + desktop), and their total should be the **sum across all of them**, not whichever synced last. This is *the* reason claim/sign-in must precede public sync: every device's CLI is bound (via the device-authorization claim flow) to the **same `user_id`**, so the server can attribute and combine their usage.

The mechanism is in the fact-table key (`ARCHITECTURE.md` §2):

- `usage_day` is keyed **per device**: `(user_id, device_id, date, tool, model)`. Each device overwrites only *its own* row for a day — so a device re-reading its local logs stays idempotent (no double-count), **and** two devices on the same day produce two rows that **add up** instead of clobbering each other.
- Your day total = `SUM` over all your devices → rolled into `usage_day_total (user_id, date)`, which is the leaderboard score. *Work 5M + personal 3M = 8M*, exactly as expected.

> **Why local-only can't work.** "Just pull everything from one laptop" fails twice: it can't see your *other* machines, and it can't produce **all-time** totals (local logs prune at ~30 days). Only the signed-in, server-accumulated history spans devices *and* time. This is the payoff of "server is the system of record."

### Time windows (1d / 7d / 30d / all-time)

All four windows are computed **server-side** from accumulated `usage_day` rows (summed across the user's devices):
- **1d / 7d / 30d** — reconstructable from either local logs or server history; the rolling windows are maintained as per-day Redis buckets (`ARCHITECTURE.md` §7).
- **all-time** — **server-only**. Local logs prune at ~30 days, so a laptop physically cannot compute a lifetime total; the server is the sole source.

### X is a BADGE + share rail, NOT login

This is a hard, cost-driven decision. **In 2026 the X API has no free tier** — even *reading* a profile requires a funded prepaid balance, and `POST /2/tweets` costs **$0.20 per post when it contains a link** (and our cards *are* links). So:

- **We never call `POST /2/tweets`.** Sharing is always client-side `x.com/intent/post` links. **$0, forever.**
- **"Connect X"** does exactly *one* cached read at connect time, stored in `linked_accounts`. It powers a **verified badge** + a share rail. It is **not** an auth provider and is **removable without a migration**.

### Vanity URL / handle namespace

- Profiles: `tokenboard.sh/user/[handle]`. Communities: `tokenboard.sh/community/[slug]`.
- `handle` and `slug` share no namespace conflict (different path prefixes) but are each unique within their space.
- The local-preview state shows a provisional handle; **claiming** via GitHub OAuth binds a real vanity handle (defaulting to the GitHub login) and migrates all locally-previewed history onto the account on first sync.

---

## 8. Leaderboards

Backed by **Upstash Redis sorted sets (ZSET)**, one per scope×window. Scores are token totals (or cost); members are user ids.

**Windows:** `7d`, `30d`, `all-time`.
**Scopes:** **per-community** (`lb:c:{slug}:{window}`) and **global** (`lb:global:{window}`).

**Create-on-write with TTL keys.** Windowed keys are materialized lazily on ingest and carry a TTL; they are a disposable read model. Source of truth is always `usage_day` in Postgres, so any key can be rebuilt by replay. This keeps Redis cheap and bounded.

### The "rank only when flattering" anti-empty rule

A rank is only motivating when it isn't embarrassing or hollow:

- **Never show "#1 of 1" or "#1 of 2."** A rank in a near-empty scope reads as sad, not impressive. Below a minimum population (e.g. < 3 in scope), suppress the *rank* and show the **raw number + the flex card** instead.
- **Surface the most flattering true framing.** If you're #4 globally but #1 in your room, lead with the room. We never fabricate a number, but we choose *which true rank to feature*.
- **Communities make this easy:** a 5-person room is dense enough that *every* member has a real, non-hollow rank — which is exactly why communities, not the global board, are the default surface.

---

## 9. Anti-Cheat & Trust Tiers

The board lives or dies on whether people believe the numbers. Defenses, in order of leverage:

1. **Cost is computed server-side, always.** Clients upload *raw token counts*, never dollar figures. The pinned LiteLLM table (§5.2) is the single pricing authority. You cannot inflate your spend by lying about price — only the server prices.
2. **Trust tiers / pills on every row** (every *public* row is at least GitHub-verified, since GitHub is mandatory to appear — §7):
   - **GitHub-verified** (baseline) — real `github_id` + avatar. The floor for any public row.
   - **🏢 company-verified** — also passed work-email domain verification (§7.2). Highest trust.
   - **✓ X-connected** — optional connected X badge, an additional identity signal.
   Pills are always visible on the board, so viewers calibrate. (No anonymous public tier exists — the local CLI preview never appears publicly.)
3. **Sanity caps (flag, don't clip).** Per-day token totals above a physically-implausible ceiling are **flagged** — never silently clipped, so lifetime totals stay intact and auditable. The ceiling is **derived**, not arbitrary: max sustained model throughput **including cache reads** (the dominant bucket — order ~10⁴ tok/s aggregate) × 86,400 s/day × a generous N parallel agents (say N≈10), which lands a per-user/day ceiling in the low-trillions of tokens. We frame it for **N parallel agents**, not a single agent, because a real power user fans out many concurrent sessions; only totals above that many-agents-running-flat-out ceiling are implausible enough to flag. The server applies this as a flag step after the cross-device day-total rollup (`ARCHITECTURE.md` §6.4); flagged days are dropped from ranking eligibility but their counts are preserved. Caps protect the global board from obvious garbage.
4. **Social context is the real anti-cheat (see §2).** In a small room of people who know each other's real stack, a faked number is self-evident and self-policing. This is *why* communities are the core surface — they make cheating socially expensive in a way a global board never can.

---

## 10. Privacy & the Trust Story

The single biggest adoption blocker for a "run this CLI and it reads your dev logs" product is trust. We treat it as a first-class feature, not a footnote.

- **`tokenboard show-data` — the trust unlock.** A **dry-run** command that prints *exactly* what would upload, to the byte, **before any upload ever happens.** This is built **first** and is the thing that converts a skeptic.
- **Aggregate-only, by construction.** **No prompts, no code, no file paths ever leave the machine.** Only aggregate token counts per (day, tool, model). The privacy promise is enforced by the upload schema itself — there is no field in the normalized record that *could* carry sensitive content.
- **`npx`, not `curl | bash`.** Installation is `npx @tokenboard/cli` — inspectable, versioned, no opaque piped shell scripts. (The internal `claude-leaderboard` used curl|bash; for a *public* product, npx is the trust-correct choice.)
- **Open-source CLI.** The harvester is open source so anyone can verify the aggregate-only claim instead of taking our word for it.
- **Credit ccusage.** We lean on the community standard for the long tail and **say so, publicly.** It's both the correct license behavior (MIT) and the aura-positive, credible move in a small scene.

> Privacy posture in one line: *the dry-run shows you everything, the schema can't carry secrets, and the code is open so you don't have to trust us.*

---

## 11. The X Growth Loop

Distribution **is** the strategy — it's the gap tokscale left on the table. The community is the viral unit; every community is a fresh mini-launch.

```
   ┌────────────────────────────────────────────────────────┐
   │                                                        │
   ▼                                                        │
  OG flex card  ──►  x.com/intent/post  ──►  rich unfurl on X
  (next/og,           (client-side, $0)       (your number +
   crawlable)                                  rank + room)
                                                    │
                                                    ▼
                                          friend: "I burn way
                                          more than that"
                                                    │
                                                    ▼
                                          npx @tokenboard/cli → APPEARS
                                                    │
                                                    ▼
                                          spins up THEIR OWN room,
                                          pulls THEIR friends
                                                    │
                                                    └──── loop forks ───┐
                                                                        │
   ◄────────────────────────────────────────────────────────────────────┘
```

1. **OG card.** Profile/room renders a crawlable flex card via `next/og`.
2. **Intent share.** Client-side `x.com/intent/post` — pre-filled text + card URL, **$0**, never the paid API.
3. **Friend rivalry.** A follower sees the unfurl, gets competitive, runs `npx @tokenboard/cli`, and **appears**.
4. **They make their own room.** Rather than joining as a guest, they create *their* community and recruit *their* circle — a brand-new mini-launch with a built-in audience. The loop doesn't just repeat, it **forks and multiplies.**

---

## 12. MVP Cut — ordered build checklist

> **24-hour sprint. No time-phasing — this is a strict build *order*, not a schedule.** Build the thinnest end-to-end vertical slice that proves the **product**, not parser breadth. Ship top-to-bottom; each item unblocks the next.

1. [ ] **Claude Code parser (the hero, all ours).** Read `~/.claude/projects/**/*.jsonl`. Keep only `type=="assistant"` lines. **Global `message.id` dedup** (handle null `requestId`). Exclude `<synthetic>` model lines; decide the rule on `isApiErrorMessage`. Emit all **4 token buckets** including the `cache_creation` *object* (1h/5m split), not just the scalar.
2. [ ] **`tokenboard show-data` dry-run** — wire alongside the parser; it's the trust unlock and must exist *before* any upload path.
3. [ ] **Cost engine.** Vendor LiteLLM `model_prices` JSON + commit an offline snapshot. Price all 4 buckets correctly. Unknown model id → **log it, don't silently read 0.** Observed model mix: `claude-opus-4-8` (dominant), `claude-sonnet-4-6`, `<synthetic>` (exclude).
4. [ ] **Ingest + GitHub OAuth + the board.** Idempotent `usage_day` upsert; GitHub login to claim a public spot; aggregate normalized records → public leaderboard view + CLI leaderboard → the X-shareable screenshot. **This is the differentiation — where the energy visibly lands.**
5. [ ] **ONE ccusage adapter, ONE tool wired.** Pick Codex or one tail tool. Shell out **client-side** `ccusage codex daily --json --offline` (source-first), map output into the normalized record, run it through *our* cost engine. **Proves the seam end-to-end** — one is enough.

**Definition of Done:** my real Claude Code usage shows up on the board with a cost number that **matches my Anthropic console**, *and* one tool routed through ccusage shows up alongside it via the **same** cost engine. That single screenshot proves the whole architecture and is itself the launch asset.

**Explicitly NOT in v1 (skip):**
- ❌ Gemini (no data exists).
- ❌ All 14 tail tools (one is enough to prove the seam).
- ❌ Forking ccusage.
- ❌ Hand-maintained pricing.
- ❌ Efficiency/intensity toggle (raw tokens/$ is the v1 headline; "for fun" — gamifies-waste is *not* a v1 concern).
- ❌ X as auth (badge + share rail only).

> Ship the board. Own the Claude Code counter. Lease the rest. That's the legit stack — and it's the one that won't get ratioed by someone whose bill doesn't match the number.

---

## 13. Scale & Performance (5k users)

**Verdict: 5,000 users is small.** Average write load is ~1.4 req/s, reads collapse to near-zero with caching, Redis ops are microsecond-scale, and row counts stay in the low tens of millions. The architecture (Next.js/Vercel + Postgres + Upstash + next/og) has **10–100× headroom** before any redesign. The risk is not throughput — it is a short list of specific footguns.

### Postgres connection pooling — the #1 risk (MANDATORY before launch)
Each Vercel serverless invocation that opens a raw TCP Postgres connection consumes one backend slot; a bursty ingest can hit `too many connections` and start dropping writes. **Fix: route Drizzle through Supabase's Supavisor pooler in transaction mode** (the "Shared Pooler" connection string from the Supabase dashboard — historically port `6543`). With `postgres-js` + Drizzle this means setting **`prepare: false`** (prepared statements aren't supported in transaction-pool mode). Our ingest is a simple idempotent `INSERT … ON CONFLICT DO UPDATE`, unaffected by transaction-mode limitations. Use the **direct** (non-pooled) connection only for long-running/migration tasks, and the **`service_role`** connection for trusted server writes. Co-locate functions and DB in one region (e.g. `iad1`) to cut connection hold time.

### Write load + cron thundering herd
5,000 hourly syncs = **~1.4 req/s average** — trivial. The only spike is a naive `0 * * * *` cron firing all 5k at `:00`. Vercel functions auto-scale (≈30,000 concurrency) so the function tier absorbs it; the real victim would be Postgres connections (above). **Fix: client-side jitter.** The CLI picks a stable per-install offset — `sleep(hash(machineId) % 3600s)` after the top of the hour, or a random minute chosen at install — flattening 5k syncs across the full window to ~1.4 req/s with no coordinated spike. Costs nothing; accept-and-queue is overkill at this scale.

### Redis ZSET headroom
A non-concern — do not optimize it. `ZADD`/`ZREVRANGE`/`ZREVRANK` are O(log N) (~12 comparisons at N=5,000). Redis does millions of ops/sec; 5k members is a toy. **Use `ZADD` (set absolute score), not `ZINCRBY`** — because sync is idempotent (re-uploading a day *overwrites* `usage_day`), the leaderboard must *set* each member's score to their current window total, not increment it, or every re-sync double-counts. See `ARCHITECTURE.md` §7 for the per-day-bucket key scheme that makes rolling windows correct. The **only** real constraint is Upstash per-command billing: ~120k syncs/day × ~3 cmds ≈ **10.8M commands/month**, which exceeds the 500K/month free tier. **Plan for PAYG (~$20–40/mo)** and **pipeline/`MULTI` the per-sync `ZADD`s** to cut REST round-trips and command count.

### OG image caching
Satori / `next/og` is genuinely CPU-bound (~150–800ms+ per render, billed as Vercel active CPU). Uncached, every Slack/Discord/X unfurl re-scrape re-renders. **Fix: CDN-cache from data-versioned immutable URLs** — e.g. `/og/[user]/[periodHash].png` with `Cache-Control: public, immutable` + long `s-maxage`. Satori then runs ~**once per key**; new data = new URL = the only cache miss. Keep the route on the Node runtime, load fonts globally/base64. Origin renders drop from thousands/hour to a handful.

### Ingest rate-limiting
Use **`@upstash/ratelimit`** (v2.0.8, GA, connectionless HTTP) with a **generous per-user fixed window** (cheapest, ~2 Redis cmds/call) set well above hourly cron + manual re-syncs (e.g. 60/hour/user keyed by API token), plus a coarse per-IP fixed window as an abuse guard. Enable the **ephemeral in-memory cache** so already-exceeded identifiers short-circuit without a Redis round-trip (abuse traffic doesn't itself burn commands). The real replay/dup defense is the **idempotent upsert** (§6) — duplicate syncs are no-op overwrites, so limits can stay loose and never block legit re-syncs.

### Read caching / ISR
Leaderboards change slowly, so caching is nearly free. **Fix:** Next.js **ISR / route-segment caching** with `revalidate` 30–120s on the leaderboard page, and the CLI `board` JSON route served with `s-maxage=60, stale-while-revalidate=120`. 5k pollers collapse to ~1 origin compute per revalidate window; Upstash read-command volume stays low. No per-request SSR needed.

### Premature at 5k (don't build yet)
- ❌ Sorted-set algorithmic optimization (microsecond ops already).
- ❌ `usage_day` table partitioning (~10–70M rows/year worst case is trivial for Postgres with the composite-PK index).
- ❌ An ingest queue / accept-and-queue pipeline (client jitter alone suffices).
- ❌ Multi-region DB / read replicas.

**Launch blockers, in order:** (1) Postgres connection pooler, (2) client cron jitter, (3) CDN-cached data-versioned OG URLs, (4) ISR/`s-maxage` on board page + CLI API, (5) generous fixed-window ingest rate limit leaning on the idempotent upsert, (6) budget Upstash PAYG (~$20–40/mo). Everything else has 10–100× headroom.

---

## 14. CLI Leaderboard

> **Goal:** after `npx @tokenboard/cli` syncs, render the user's community leaderboard right in the terminal — screenshot-worthy, instant, and graceful when there's no community, no color, or no data. A great terminal board is itself a share artifact (devs post their terminals), so this doubles as a second distribution surface alongside the web OG card.

> **Retention MOTD nudge.** The hourly cron sync is silent, so the *next interactive* `npx @tokenboard/cli` run is our one retention surface — use it. On that run, print a one-line terminal MOTD nudge driven by the `delta`/`rankChange` already present in the board JSON (§14.4), e.g. `‹dim›you dropped to #4 — Dana passed you›`. A negative rank change with a named passer is the exact "come back tomorrow" hook from §2; it costs nothing (the data is already in the board payload) and turns a silent background sync into a reason to re-engage.

> **Interactive vs. cron — the load-bearing split.** Everything below (URLs, prompts, nudges) prints **only on an interactive run** (`process.stdout.isTTY`). The scheduled `tokenboard sync` (cron/launchd, §13) stays **silent** — no URLs, and **never an interactive prompt** (a `[y/N]` in a background job would hang forever). The CLI detects TTY and degrades to silent automatically.

> **Post-sync footer (interactive only).** After an interactive sync, print the board, then two affordances that use fields already in the `/sync` response (`board_url`, `profile_url`):
> ```
> ✔ synced 6.9M tokens · you're #5 in steel-cartel
> → live board:  tokenboard.sh/community/steel-cartel
> → your profile: tokenboard.sh/user/devon
> ```
> This drives web traffic and feeds the share loop (a dev who sees their rank in the terminal clicks through to the shareable web board).

> **Work-email verification — an interactive nudge, not a command.** Company boards ("race your coworkers") exist (`ARCHITECTURE.md` §5), but the email magic-link/OTP needs a browser, so we don't make users learn a command. Instead, on an interactive run, **if the user is signed in (claimed) and not yet on any company board**, show a **one-time `[y/N]` prompt**:
> ```
> Race your coworkers too? Verify your work email [y/N] › y
> → opening tokenboard.sh/verify …   (enter your work email there; click the link we email you)
> ```
> `y` → open the browser to `tokenboard.sh/verify` (the existing web flow in §5.3 does the rest: enter email → emailed magic-link/OTP → auto-join the domain's company board). `N` (or non-TTY) → do nothing and don't re-ask this session. The terminal stays dumb; all email/link handling is web-side. There is **no `tokenboard verify` command** — this redirect-on-`y` prompt is the entire CLI surface for it.

### 14.1 Commands
Minimal surface; the bare command does the 90% thing.

```
tokenboard                      # sync local usage → server, then render MY boards
tokenboard top                  # global / default board
tokenboard board <slug>         # a specific community board
tokenboard board <slug> --30d   # …over a window
tokenboard me                   # my rank + stats across communities (one line each)
tokenboard join <slug>          # join a community
tokenboard sync                 # sync only, no render (cron / CI)
```

**Flags** (any render command):

| Flag | Meaning | Default |
|---|---|---|
| `--7d` / `--30d` / `--all` | leaderboard window | `--7d` |
| `-c, --community <slug>` | pick community when in several | primary |
| `--top <n>` | rows to show (clamps to terminal height) | `10` |
| `--me` | always include your row (pinned at bottom if off-screen) | on |
| `--no-color` | force plain output (also honors `NO_COLOR`, non-TTY) | auto |
| `--json` | raw board JSON, no rendering | off |

Rules: bare `tokenboard` = hero path (sync, then auto-render primary board; compact line per non-primary community). Windows are bare flags (`--7d`), not `--window=7d`. Nouns, not subcommand-soup (`top`, `board`, `me`, `join`).

### 14.2 Render approach
**MVP: static pretty-print** — render once, print, exit. No event loop, no alt-screen, no flicker. Composes into the post-sync flow, pipes cleanly, screenshots trivially (it's just scrollback). Interactive TUIs fight the "I ran a command and got a beautiful artifact" feeling and break when piped or captured mid-frame.

**MVP stack (static):**

| Concern | Lib | Why |
|---|---|---|
| Color/bold/dim | **`picocolors`** | ~7× smaller/faster than chalk; auto-detects TTY / `NO_COLOR` |
| Table layout | **hand-rolled box-drawing** (not `cli-table3`) | need a sparkline column, per-cell color, medals, right-aligned numerics, highlighted row — `cli-table3` fights all of these (~120-line helper gives full control) |
| String width | **`string-width`** + **`cli-truncate`** | correct alignment for emoji/CJK handles; `…` truncation |
| Sparklines | **`sparkly`** (or 8-line hand-roll over `▁▂▃▄▅▆▇█`) | per-user daily-burn micro-chart |
| Arg parsing | **`citty`** or **`cac`** | tiny declarative subcommands+flags (<10kB) |
| Spinner (sync only) | **`nanospinner`** / **`ora`** | cleared before the board prints |

**Interactive upgrade (post-MVP, behind `tokenboard top -i`):** use **`ink`** (React-for-CLIs; the lib Claude Code itself is built on) + **`ink-table`**/custom components. ←/→ switch window (7d/30d/all), ↑/↓ or tab switch community, `/` filters handles, `q` quits; ink owns the alt-screen/redraw. The static renderer stays the default and the piped/`--json` fallback — ink is opt-in so the screenshot path never regresses.

### 14.3 Mockups
> Target width **68 cols**. `**bold**`, `‹dim›`, `[color]` tags mark where ANSI goes — they are NOT printed.

**(a) Full community leaderboard**
```
┌────────────────────────────────────────────────────────────────┐
│  🪙 tokenboard ‹dim›·› **steel-cartel** ‹dim›· last 7 days›       │
├────┬─────────────────────┬──────────┬───────┬──────────────────┤
│ #  │ builder             │   tokens │  Δ wk │ daily burn       │
├────┼─────────────────────┼──────────┼───────┼──────────────────┤
│ 🥇 │ **doomslug**        │  12.4M   │ [grn]▲2[/] │ ▂▃▅▂█▆▃          │
│ 🥈 │ kernelpanic         │  11.8M   │ [grn]▲1[/] │ ▅▄▆▅▃▇▆          │
│ 🥉 │ vibe_compiler       │   9.2M   │ [red]▼1[/] │ █▆▃▂▄▃▂          │
│  4 │ asyncawaitlonger…   │   7.7M   │  ‹dim›–›  │ ▃▃▄▄▃▅▄          │
├────┼─────────────────────┼──────────┼───────┼──────────────────┤
│[inv] ▸ 5 │ **you** ‹dim›(devon)›  │ **6.9M** │ [grn]▲3[/] │ ▁▂▄▆█▇▅ [/inv]│
├────┼─────────────────────┼──────────┼───────┼──────────────────┤
│  6 │ promptsmith         │   6.1M   │ [red]▼1[/] │ ▆▅▄▃▂▁▂          │
│  7 │ gigachad_io ‹gold›◆› │   5.4M   │  ‹dim›–›  │ ▄▄▄▅▄▄▄          │
│  8 │ tinyctx             │   3.0M   │ [grn]▲4[/] │ ▁▁▂▃▅▆█          │
└────┴─────────────────────┴──────────┴───────┴──────────────────┘
  ‹dim›42 builders · 318M tokens this week · ↑18% vs last›
  ‹dim›tier ◆ = whale (>10M/wk) · run `tokenboard top --30d` for month›
```

- **Title bar:** 🪙 + slug **bold** in tier color; window label dim, changes with the flag.
- **Medals:** 🥇🥈🥉 for ranks 1–3; plain right-aligned number after.
- **Your row:** full-width **inverse/reverse-video** band (most reliable highlight across themes), `▸` pointer, `**you** (handle)`, tokens **bold** — the row people screenshot.
- **Δ wk:** `▲n` green, `▼n` red, `–` dim for none/new; reserve fixed width so columns don't jitter.
- **Sparkline:** 7 glyphs `▁▂▃▄▅▆▇█` of daily burn, normalized per-row, single accent color (e.g. cyan).
- **Tier marker:** `◆` in tier color after the handle (gold = whale).
- **Numbers:** humanized (`12.4M`, `980K`), right-aligned.
- **Footer:** dim meta — member count, total, WoW trend, one hint.

**(b) Compact post-sync summary line** (prints by default after sync, before the full board; the only thing shown for non-primary communities)
```
✔ ‹dim›synced 1.2M tokens (7 days)›
  🪙 **steel-cartel**  ‹dim›#›**5**‹dim›/42›  6.9M  [grn]▲3 this week[/]  ▁▂▄▆█▇▅
```
- Line 1: green ✔ + dim sync confirmation.
- Line 2: coin, **bold** community, **bold** rank (`#5/42`), tokens, green delta, sparkline.
- Multiple communities → one line each, then `‹dim›→ tokenboard board <slug> for the full leaderboard›`.

### 14.4 Data source & auth
**Render = fetch JSON + print.** The CLI never computes ranks; the server is source of truth.

The CLI calls the **canonical board endpoint defined in `ARCHITECTURE.md` §7.2** — there is one `GET /api/v1/board` contract, not a CLI-specific one:
```
GET /api/v1/board?community=<slug>&window=7d&metric=tokens&me=<handle>&format=cli
Authorization: Bearer <token>
```
The response is the rich shape from §7.2 (`community`, `window`, `metric`, `entries[]` with `rank/handle/tokens/cost/delta{…}/sparkline[…]/isMe/…`, and a `me` object). The **CLI renders only the terminal-showable subset** — rank, `@handle`, tokens (or `cost`), the `delta.direction`+`delta.rankChange` arrow, and an optional inline sparkline — and ignores the web-only fields (`avatar`, `displayName`, `tierPill`, `topTool`). Passing `format=cli` has the server omit those web-only fields for a smaller payload; `--json` still returns the full §7.2 shape.
- **Server owns** ranking, deltas, sparkline buckets, humanization inputs, and `isMe`. The client only styles — keeps the board tamper-resistant and lets ranking logic change without shipping a new CLI.
- **Auth:** the first `npx @tokenboard/cli` renders a **local preview** with no account. `tokenboard claim` runs the GitHub device-authorization flow and mints a **device-bound ingest token** (`~/.config/tokenboard/auth.json`, `chmod 600`); the board/render calls send it as the bearer. Every machine claims its own token bound to the same `user_id`, so multiple laptops accumulate (§7.3). There is no permanent anonymous public row — appearing on a public board requires the claim.
- **Caching:** cache the last board JSON at `~/.cache/tokenboard/<slug>-<window>.json`. On network failure, render the cached board with a dim `‹stale · 2h ago›` tag instead of erroring. `--json` short-circuits all rendering. (Server sends `s-maxage=60, stale-while-revalidate=120` per §13 so 5k pollers collapse to ~1 origin compute/min.)

### 14.5 Edge cases

| Case | Behavior |
|---|---|
| **Not in any community** | No empty box. `✔ synced 1.2M tokens`, then `‹dim›You're not in a community yet.›` + CTAs `tokenboard join <slug>` and `tokenboard create`, plus a short shareable invite hint. |
| **Board with 1 member (you)** | "Rank only when flattering." No `#1 of 1`. Solo card: handle, tokens, sparkline, `‹dim›invite builders to start the board›` — no rank line, no `Δ` column. Rank returns when a 2nd member appears. |
| **Very long handles** | Truncate to column width with `cli-truncate` → `asyncawaitlonger…`; width measured via `string-width` so emoji/CJK don't break alignment. Your own row gets one extra char before truncating (so "you" reads). |
| **No color / piped / non-TTY** | Respect `NO_COLOR`, `--no-color`, `!process.stdout.isTTY`. Drop ANSI; keep box-drawing (still aligns) or fall back to a 2-space-padded plain table. Medals → `1. 2. 3.`, deltas → `+2 / -1 / =`, sparkline → `[3 4 6 3 9 7 4]` or omit. `--json` is the canonical machine path. |
| **Narrow terminal (<60 cols)** | Drop sparkline column first, then delta column, then truncate handles harder. Never wrap a row across lines. |
| **Stale / offline** | Render cached JSON with a dim `‹stale · 2h ago›` badge (§14.4). |
| **Unicode-hostile terminal** | `--ascii` (or auto-detect via `TERM`/locale) swaps box-drawing for `+ - |` and glyphs for ASCII so the table never becomes mojibake in a screenshot. |

### 14.6 Implementation note
Ship the static renderer as one pure `renderBoard(json, {color, width, ascii}) → string`. The post-sync flow, `top`, `board`, and `me` all call it; `--json` bypasses it; the future `ink` mode reuses the same humanize/sparkline/delta helpers. One contract (the canonical `ARCHITECTURE.md` §7.2 board JSON), one renderer, every surface consistent.

---

## 15. Open Questions

1. **`isApiErrorMessage` rule** *(small empirical check, not a design debate).* When Claude Code errors mid-response, it still writes an assistant line tagged `isApiErrorMessage: true` — and a partial/failed generation may still have **billed real tokens** (model emitted 500 tokens then errored → you paid for 500). So: do we **count** those tokens or **skip** them? Counting tokens Anthropic didn't bill → our number reads *high*; skipping tokens it *did* bill → our number reads *low*. Either way the board disagrees with the user's Anthropic console on error-heavy days, which erodes trust. **Resolution: run one day of real logs through the parser both ways and compare totals to the Anthropic console; pick whichever rule matches.** A 30-minute reconciliation during parser build, not a blocker.
2. **Community visibility defaults & abuse.** Public rooms are discoverable and SEO-valuable but invite spam/squatting on good slugs; unlisted rooms are safer but spread worse. What's the right default, and do we need slug reservation / reporting before public launch? *(See `ARCHITECTURE.md` for the company-domain verification + slug-namespace design.)*

> **Resolved since v1 of this doc** (moved out of open questions): *Auth* — GitHub OAuth is **mandatory to appear on a public board** (maximize captured identity), but `npx @tokenboard/cli` shows a **local preview with no login first** (value-first, then "Sign in with GitHub to claim"); see §7. This removes the old "anonymous-tier retention" question — there are **no permanent anonymous public users**. *ccusage integration* — client-side shell-out, source-first syntax, no importable library; see §5.2. *Public company-board optics* — **DECIDED**: show the real company name/logo immediately (the brand is the distribution), with **alias-by-default for company-scoped rows** + a **fast self-serve emergency-privatize/takedown path** (one-click, immediate); not anonymize-until-claim. Residual risk: brief public exposure of aggregate spend before privatize. See §7.2.
