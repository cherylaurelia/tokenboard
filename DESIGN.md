# tokenboard — Design Doc

> **Single source of truth.** This document is canonical. Decisions here are *decided*, not open for re-litigation. Open questions are explicitly flagged in §13.

---

## 1. Overview & Positioning

**tokenboard** (tokenboard.sh) is a public consumer web product.

**One-liner:** *Cursor profiles, but multi-tool and ranked — race your friends.*

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
  $ npx tokenboard
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

1. **Preview (~30s, no login).** `npx tokenboard` harvests local usage and renders your number — and a *local* teaser board — **right in the terminal**, before any account exists. This is the dopamine hit and it happens first. Nothing is uploaded yet.
2. **Hooked.** You see your real burn, beautifully rendered (§14). The CLI's call to action: *"Sign in with GitHub to claim your spot & see your community."*
3. **Claim → appear.** Click through → GitHub OAuth (one click for devs) → a device token binds to your account, your previewed history uploads, you pick a vanity URL, get the **verified badge**, and now you're on the **public** board and can create/join communities.

> Login is never a gate in front of *value* — the value (your number) shows first, locally. Login is the gate in front of *appearing publicly*, which is exactly where we want maximum captured identity.

### 3.2 Create / Join a community

**Create:**
1. Authenticated user clicks **New Room**, names it (e.g. `the-boys`), picks public/unlisted.
2. Server mints a community with a slug (`tokenboard.sh/c/the-boys`) and an **invite link**.
3. Creator is auto-added as first member + admin.

**Join:**
1. Open an invite link → if logged in, one-click join; if not, sign in with GitHub (after the local `npx tokenboard` preview), then join. Company boards instead auto-join on **work-email verification** (§7.2).
2. On join, your existing `usage_day` history backfills the room's windowed leaderboard (you don't start at zero — you start with your real numbers).

### 3.3 The X share loop (numbered)

1. You hit a milestone or just want to flex — your profile or room renders an **OG flex card** (`next/og` / Satori) at a crawlable URL.
2. You click **Share** → a client-side `x.com/intent/post` link opens, pre-filled with text + the card URL. **$0 — no API call, ever.**
3. The card posts to X as a rich link unfurl (large image). Your followers see your number, your rank, and your room.
4. A friend sees it, thinks *"I burn way more than that,"* clicks through, runs `npx tokenboard`, and **appears** on the board.
5. They don't want to be in *your* room as a guest — they spin up *their own* room and pull *their* friends. **The loop closes and forks.** Every share is a potential new mini-launch.

---

## 4. Architecture

Two surfaces, one system of record:

- **CLI (`npx tokenboard`)** = the *install / harvest* surface. Runs on your machine, reads local logs, uploads **aggregates only**.
- **Web (Next.js on Vercel)** = the *view / share* surface. SSR profile and community pages for SEO and crawlable share targets; `next/og` Satori cards.

The split matters because of a hard constraint: **agent logs prune.** Claude Code keeps roughly a rolling ~30-day window on disk. The client therefore only ever *sees* a window. **The server is the system of record** — it accumulates daily aggregates **forever**, so your lifetime total survives long after the local logs that produced it are gone.

```
  ┌──────────────────────────── YOUR MACHINE ────────────────────────────┐
  │  npx tokenboard                                                       │
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
  │  SSR pages   ── /u/[handle]  /c/[slug]   (crawlable, SEO)             │
  │  next/og     ── Satori OG flex cards                                  │
  └───────────┬──────────────────────────────────────┬────────────────────┘
              │                                        │
              ▼                                        ▼
  ┌──────────────────────┐                ┌───────────────────────────────┐
  │ Postgres (Neon/      │                │ Upstash Redis                 │
  │ Supabase) + RLS      │                │ sorted sets (ZSET)            │
  │ SYSTEM OF RECORD     │   read models  │ windowed leaderboards         │
  │ accumulates FOREVER  │ ─────────────► │ create-on-write, TTL keys     │
  │ users, linked_accts, │                │ (7d / 30d / all per scope)    │
  │ communities, members,│                │                               │
  │ usage_day            │                │                               │
  └──────────────────────┘                └───────────────────────────────┘
```

**Stack, named:**
- **Next.js on Vercel** — SSR for crawlable profile/community pages (SEO + share-target unfurls); `next/og` Satori for share cards.
- **Postgres (Neon or Supabase) + Row-Level Security** — durable system of record.
- **Upstash Redis sorted sets** — windowed leaderboards, created on write with TTL keys (cheap, ephemeral, recomputable from Postgres).

Postgres is **truth**; Redis is a **fast, disposable read model** for ranking. If Redis is lost, leaderboards rebuild from `usage_day`.

---

## 5. Usage Counting — the HYBRID decision

> This was the one genuinely open question, framed as: *building the counting core myself vs. depending on `ccusage` (the "aura loss" of leaning on someone else's tool).* It is now **decided.**

**VERDICT: HYBRID — write our own Claude Code parser (the hero tool), shell out to `ccusage` for the 14-tool long tail, and compute cost server-side from LiteLLM pricing. Ship it.**

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
| **communities** | `id`, `slug`, `name`, `visibility` (`public`/`unlisted`), `owner_id`, `created_at` | A "room." `slug` → `tokenboard.sh/c/[slug]`. |
| **memberships** | `community_id`, `user_id`, `role` (`admin`/`member`), `joined_at` | Many-to-many user↔community. |
| **usage_day** | **PK (`user_id`, `date`, `tool`, `model`)**, `input`, `output`, `cache_read`, `cache_create_5m`, `cache_create_1h`, `cost_usd`, `updated_at` | The atom of usage. One row per user/day/tool/model. |

**Idempotent upsert (the load-bearing decision).** Because the client only ever sees a rolling window and re-uploads overlapping ranges every run, ingestion **must** be safe to repeat. The composite PK `(user_id, date, tool, model)` + `INSERT ... ON CONFLICT DO UPDATE` makes re-uploading the same day a no-op rather than a double-count. The client can run as often as it likes; the server stays correct.

**Server accumulates forever.** Once a `usage_day` row lands, it's permanent — even after the source logs prune off the user's disk. Lifetime totals are a `SUM` over `usage_day`, never dependent on what's currently on any machine.

**`cost_usd` is computed server-side** by the cost engine (§5.2) at ingest time and stored on the row, so leaderboards never recompute pricing at read time.

---

## 7. Auth & Identity

**GitHub OAuth is primary and MANDATORY to appear on a public board.** It's the right identity for a developer audience, gives us a real avatar for the board for free, and `github_id` is a strong, stable anti-sock-puppet anchor. We require it (rather than allowing permanent anonymous users) to **maximize captured identity** — every public row is a real, claimable account. **Email magic-link is the fallback** for people who won't OAuth, and is *also* the mechanism for company-board membership (§7.2).

> **Value-first, not login-first.** Requiring GitHub does *not* mean a login wall at the door. `npx tokenboard` first renders a **local preview** (your number + a local board) with **no login**, *then* prompts *"Sign in with GitHub to claim your spot & see your community."* Order is **appear → hooked → claim** (§3.1). The login happens while the user is already hooked, not before they've seen value. There are **no permanent anonymous public users** — the local preview is the only pre-auth state.

Board rows show **GitHub avatars** — recognizable faces are what make "you vs your friends" legible at a glance.

### 7.1 Membership tiers (one `communities` table, three behaviors)

All three tiers are the **same table**, differing only by a `type` + `join_policy` + `visibility`. We don't build three systems — one system with a verification strategy per room. (Full schema + flows in `ARCHITECTURE.md`.)

| Tier | What it is | Join / verification | Default visibility |
|---|---|---|---|
| **Individual** | Just you, your GitHub identity + vanity profile | GitHub OAuth (verification tier 1) | public profile |
| **Community / Group** | Anyone creates one; friends join | invite link or 6-char code (`join_policy: open` / `code`) | unlisted or public |
| **Company** | An org board that auto-groups verified employees | **work-email domain** magic-link/OTP (verification tier 2) → `@amazon.com` proves mailbox control → auto-join + 🏢 badge | public (org-admin can privatize) |

**Verification ladder:** tier 1 = **GitHub** (who you are), tier 2 = **work email** (which company you're in). No SAML, no WorkOS — a public consumer product wants the lightweight magic-link path, not enterprise SSO.

### 7.2 Work-email (company) verification

1. User clicks **Join `<company>`** → enters `you@company.com`.
2. Server emails a **magic link / 6-digit code**; clicking it proves mailbox control.
3. Auto-add to the company community + grant the 🏢 verified-company badge.
4. **Block disposable domains** (`@mailinator.com`, etc.) and **`+`-subaddress tricks**; rate-limit verification attempts.

Company boards are **public by default** ("Stripe vs Ramp, who burns more tokens" is exactly the X-native content), with an **org-admin private toggle** (see §15 open question on optics).

### X is a BADGE + share rail, NOT login

This is a hard, cost-driven decision. **In 2026 the X API has no free tier** — even *reading* a profile requires a funded prepaid balance, and `POST /2/tweets` costs **$0.20 per post when it contains a link** (and our cards *are* links). So:

- **We never call `POST /2/tweets`.** Sharing is always client-side `x.com/intent/post` links. **$0, forever.**
- **"Connect X"** does exactly *one* cached read at connect time, stored in `linked_accounts`. It powers a **verified badge** + a share rail. It is **not** an auth provider and is **removable without a migration**.

### Vanity URL / handle namespace

- Profiles: `tokenboard.sh/u/[handle]`. Communities: `tokenboard.sh/c/[slug]`.
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
3. **Sanity caps.** Per-day token totals above a physically-implausible ceiling are flagged/capped (you can't realistically emit more than *X* tokens/day through a single agent). Caps protect the global board from obvious garbage.
4. **Social context is the real anti-cheat (see §2).** In a small room of people who know each other's real stack, a faked number is self-evident and self-policing. This is *why* communities are the core surface — they make cheating socially expensive in a way a global board never can.

---

## 10. Privacy & the Trust Story

The single biggest adoption blocker for a "run this CLI and it reads your dev logs" product is trust. We treat it as a first-class feature, not a footnote.

- **`tokenboard show-data` — the trust unlock.** A **dry-run** command that prints *exactly* what would upload, to the byte, **before any upload ever happens.** This is built **first** and is the thing that converts a skeptic.
- **Aggregate-only, by construction.** **No prompts, no code, no file paths ever leave the machine.** Only aggregate token counts per (day, tool, model). The privacy promise is enforced by the upload schema itself — there is no field in the normalized record that *could* carry sensitive content.
- **`npx`, not `curl | bash`.** Installation is `npx tokenboard` — inspectable, versioned, no opaque piped shell scripts. (The internal `claude-leaderboard` used curl|bash; for a *public* product, npx is the trust-correct choice.)
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
                                          npx tokenboard → APPEARS
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
3. **Friend rivalry.** A follower sees the unfurl, gets competitive, runs `npx tokenboard`, and **appears**.
4. **They make their own room.** Rather than joining as a guest, they create *their* community and recruit *their* circle — a brand-new mini-launch with a built-in audience. The loop doesn't just repeat, it **forks and multiplies.**

---

## 12. MVP Cut — ordered build checklist

> **24-hour sprint. No time-phasing — this is a strict build *order*, not a schedule.** Build the thinnest end-to-end vertical slice that proves the **product**, not parser breadth. Ship top-to-bottom; each item unblocks the next.

1. [ ] **Claude Code parser (the hero, all ours).** Read `~/.claude/projects/**/*.jsonl`. Keep only `type=="assistant"` lines. **Global `message.id` dedup** (handle null `requestId`). Exclude `<synthetic>` model lines; decide the rule on `isApiErrorMessage`. Emit all **4 token buckets** including the `cache_creation` *object* (1h/5m split), not just the scalar.
2. [ ] **`tokenboard show-data` dry-run** — wire alongside the parser; it's the trust unlock and must exist *before* any upload path.
3. [ ] **Cost engine.** Vendor LiteLLM `model_prices` JSON + commit an offline snapshot. Price all 4 buckets correctly. Unknown model id → **log it, don't silently read 0.** Observed model mix: `claude-opus-4-8` (dominant), `claude-sonnet-4-6`, `<synthetic>` (exclude).
3. [ ] **Ingest + GitHub OAuth + the board.** Idempotent `usage_day` upsert; GitHub login to claim a public spot; aggregate normalized records → public leaderboard view + CLI leaderboard → the X-shareable screenshot. **This is the differentiation — where the energy visibly lands.**
4. [ ] **ONE ccusage adapter, ONE tool wired.** Pick Codex or one tail tool. Shell out **client-side** `ccusage codex daily --json --offline` (source-first), map output into the normalized record, run it through *our* cost engine. **Proves the seam end-to-end** — one is enough.

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
Each Vercel serverless invocation that opens a raw TCP Postgres connection consumes one backend slot. Neon's 0.25 CU free tier exposes only ~**97 usable direct connections** (104 − 7 reserved); a bursty ingest will hit `too many connections` and start dropping writes. **Fix (pick one):**
- **Neon pooled endpoint** — add `-pooler` to the host (PgBouncer, **transaction mode**, `max_client_conn` 10,000); **or**
- **`@neondatabase/serverless` HTTP driver** — queries over HTTP/WebSocket, sidesteps TCP connection accounting entirely (ideal for one-shot serverless ingest writes); **or**
- **Supabase Supavisor** transaction-mode pooler on port `6543`.

When adopting a transaction-mode pooler, configure the client for it: **Prisma** needs `?pgbouncer=true&connection_limit=1`; or prefer the Neon HTTP driver to avoid the prepared-statement / session-state class of issues entirely. Our ingest is a simple idempotent `INSERT … ON CONFLICT DO UPDATE`, which is unaffected by transaction-mode limitations. Co-locate functions and DB in one region (e.g. `iad1`) to cut connection hold time.

### Write load + cron thundering herd
5,000 hourly syncs = **~1.4 req/s average** — trivial. The only spike is a naive `0 * * * *` cron firing all 5k at `:00`. Vercel functions auto-scale (≈30,000 concurrency) so the function tier absorbs it; the real victim would be Postgres connections (above). **Fix: client-side jitter.** The CLI picks a stable per-install offset — `sleep(hash(machineId) % 3600s)` after the top of the hour, or a random minute chosen at install — flattening 5k syncs across the full window to ~1.4 req/s with no coordinated spike. Costs nothing; accept-and-queue is overkill at this scale.

### Redis ZSET headroom
A non-concern — do not optimize it. `ZADD`/`ZINCRBY` are O(log N) (~12 comparisons at N=5,000), `ZREVRANGE`/`ZREVRANK` are O(log N + K). Redis does millions of ops/sec; 5k members is a toy. The **only** real constraint is Upstash per-command billing: ~120k syncs/day × ~3 cmds ≈ **10.8M commands/month**, which exceeds the 500K/month free tier. **Plan for PAYG (~$20–40/mo)** and **pipeline/`MULTI` the per-sync `ZINCRBY`s** to cut REST round-trips and command count.

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

> **Goal:** after `npx tokenboard` syncs, render the user's community leaderboard right in the terminal — screenshot-worthy, instant, and graceful when there's no community, no color, or no data. A great terminal board is itself a share artifact (devs post their terminals), so this doubles as a second distribution surface alongside the web OG card.

### 14.1 Commands
Minimal surface; the bare command does the 90% thing.

---

## 15. Open Questions

1. **`isApiErrorMessage` rule** *(small empirical check, not a design debate).* When Claude Code errors mid-response, it still writes an assistant line tagged `isApiErrorMessage: true` — and a partial/failed generation may still have **billed real tokens** (model emitted 500 tokens then errored → you paid for 500). So: do we **count** those tokens or **skip** them? Counting tokens Anthropic didn't bill → our number reads *high*; skipping tokens it *did* bill → our number reads *low*. Either way the board disagrees with the user's Anthropic console on error-heavy days, which erodes trust. **Resolution: run one day of real logs through the parser both ways and compare totals to the Anthropic console; pick whichever rule matches.** A 30-minute reconciliation during parser build, not a blocker.
2. **Community visibility defaults & abuse.** Public rooms are discoverable and SEO-valuable but invite spam/squatting on good slugs; unlisted rooms are safer but spread worse. What's the right default, and do we need slug reservation / reporting before public launch? *(See `ARCHITECTURE.md` for the company-domain verification + slug-namespace design.)*
3. **Public company-board optics.** A public company board exposes that org's collective AI-spend trend. Most won't care; some might. Default company boards to **public with an org-admin private toggle** — confirm this is the right default before recruiting named companies.

> **Resolved since v1 of this doc** (moved out of open questions): *Auth* — GitHub OAuth is **mandatory to appear on a public board** (maximize captured identity), but `npx tokenboard` shows a **local preview with no login first** (value-first, then "Sign in with GitHub to claim"); see §7. This removes the old "anonymous-tier retention" question — there are **no permanent anonymous public users**. *ccusage integration* — client-side shell-out, source-first syntax, no importable library; see §5.2.
