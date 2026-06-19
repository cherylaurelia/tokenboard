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

The mantra: **APPEAR → HOOKED → CLAIM.** You should be *on a board* before you ever create an account. Login is the async step where you *claim* what already exists.

```
  $ npx tokenboard
  ─────────────────────────────────────────────
  scanning ~/.claude/projects ...        ✓ 1,207 sessions
  computing aggregate usage ...          ✓
  you burned 4.2B tokens · ~$1,180 this month

  → you're on the board:  tokenboard.sh/u/anon-7f3a
  → claim your profile + verified badge:  tokenboard.sh/claim/7f3a
  ─────────────────────────────────────────────
```

1. **Appear (~30s).** `npx tokenboard` harvests local usage, uploads aggregates, and drops you onto a board under an anonymous handle. **No login required to appear.** This is the dopamine hit and it happens first.
2. **Hooked.** The CLI prints your live board URL. You see your number, ranked, immediately. You can share that URL before you've signed up for anything.
3. **Claim (async).** Visit the claim link → GitHub OAuth → your anonymous handle and all its accumulated history bind to your account, you pick a vanity URL, and you get the **verified badge**. The claim step is where identity and the vanity layer attach — *after* you're already hooked.

> Login is never a gate in front of value. It's the upgrade you reach for once you already want it.

### 3.2 Create / Join a community

**Create:**
1. Authenticated user clicks **New Room**, names it (e.g. `the-boys`), picks public/unlisted.
2. Server mints a community with a slug (`tokenboard.sh/c/the-boys`) and an **invite link**.
3. Creator is auto-added as first member + admin.

**Join:**
1. Open an invite link → if logged in, one-click join; if not, run `npx tokenboard` first to *appear*, then claim + join.
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
  │    └─ ccusage adapter (shell out) ── 14 other tools                   │
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

### 5.2 The "aura loss" feeling — the honest reframe

The instinct — *"depending = not innovating; the stack should all be mine"* — is backwards **in this specific scene.**

**The parser is not the moat. It's plumbing.** Re-implementing JSONL/SQLite log readers for 15 agents is undifferentiated work that everyone who's looked at it agrees is undifferentiated. And the failure mode is brutal: if dedup is subtly wrong, **the leaderboard numbers visibly disagree with people's real Anthropic bills.** On a public board distributed on X, a wrong number isn't a bug — it's the screenshot that kills credibility. The aura you'd be protecting is exactly the aura a buggy parser destroys.

**Where the aura actually lives:** tokenboard's moat is everything *on top* of accurate counts — the board, the comparisons, the framing, the social/leaderboard layer, the X-native distribution. Counting is a commodity input to the actual product.

**But the instinct isn't wrong — it's mis-aimed.** Note what tokscale (our most direct competitor) did: built a *custom* Rust parser, didn't credit ccusage, and markets "10× faster, 35+ clients." So "I built my own counting core" *is* a legitimate differentiation story — **if performance or coverage is your wedge.** The hybrid lets us make that claim *honestly* for the load-bearing tool, without pretending the long tail is a moat it isn't.

**The status math, plainly:**
- Reinventing all 15 parsers to "look hardcore" → **low-status** (a part-time maintenance job with zero differentiation).
- Quietly cloning ccusage without credit → **the actual aura-loss move** (ryoppippi is a known quantity in a small scene; you'll get caught and it reads as insecure).
- **Owning the hero parser + leverage-with-attribution on the tail → high-status, credible-founder move.** *"I wrote my own Claude Code counter because accuracy on my main tool was non-negotiable; I lean on the community standard for the long tail"* is a flex **and** it's true.

We get to say *"the Claude Code counter is all mine."* That's the real, defensible version of the feeling.

### 5.3 The HYBRID path — and the exact seam

**Own:** the Claude Code parser. Primary tool (~1207 files of real data on disk now), best-documented format, bounded build, and the one place wrong numbers publicly embarrass us.

**Depend:** `ccusage` for the ~14-tool long tail (Codex, Gemini, Goose, Amp, Qwen, Copilot CLI, etc.). Let ryoppippi absorb the several-releases-per-week maintenance tax for formats users rarely touch.

```
                    ┌─────────────────────────────────────┐
   Claude Code  →   │  OUR parser (Rust/TS)               │
   JSONL transcripts│  • global message.id dedup          │ ─┐
                    │  • skip synthetic/error/non-asst    │  │
                    └─────────────────────────────────────┘  │
                                                              ▼
                    ┌─────────────────────────────────────┐  ┌──────────────────┐
   14 other tools → │  ccusage CLI (shell out)            │  │ Normalized usage │
                    │  `ccusage <tool> --json --offline`  │ ─┤ record (OUR      │
                    │  ingest stdout JSON                 │  │ schema)          │
                    └─────────────────────────────────────┘  └────────┬─────────┘
                                                                       ▼
                                                       ┌──────────────────────────┐
                                                       │ Cost engine (server-side)│
                                                       │ LiteLLM price JSON +      │
                                                       │ offline snapshot,         │
                                                       │ 4 buckets + 1h/5m cache   │
                                                       └──────────────────────────┘
```

**Seam decisions, exactly:**

1. **The integration boundary is the CLI/JSON line, not a library import.** As of v20, ccusage ships as a Rust binary with *no importable JS parser function* — so we shell out to `ccusage <tool> --json --offline` and ingest stdout. This is a *feature*: the process boundary insulates us from ccusage's internal churn. We depend on its **output contract**, not its internals.

2. **Both paths emit OUR normalized record.** Our parser and the ccusage adapter both produce the same shape:
   ```
   { tool, model, input, output, cacheRead, cacheCreate5m, cacheCreate1h, ts, costUSD }
   ```
   Downstream (the board) never knows which path a row came from.

3. **Compute cost server-side, in ONE place, for BOTH paths.** There is **no `costUSD` on disk** for Claude Code, and pricing has **4 buckets** that price differently (cache-read ~0.1×, cache-write 1.25×/2× by TTL). Don't trust ccusage's cost number and don't hand-maintain a table. **Vendor the LiteLLM `model_prices` JSON, ship an offline snapshot, and run our cost engine over raw token counts from both paths.** One consistent cost methodology across all 15 tools — removes *"did ccusage and my parser price differently?"* as a whole class of bug. (tokscale, ccusage, and us all converge on LiteLLM as the pricing oracle — reinventing the *price table* is the genuinely dumb move; reinventing the *parser* for the hero tool is the smart one.)

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

**`cost_usd` is computed server-side** by the cost engine (§5.3) at ingest time and stored on the row, so leaderboards never recompute pricing at read time.

---

## 7. Auth & Identity

**GitHub OAuth is primary.** It's the right identity for a developer audience, gives us a real avatar for the board for free, and `github_id` is a strong, stable anti-sock-puppet anchor. **Email magic-link is the fallback** for people who won't OAuth.

Board rows show **GitHub avatars** — recognizable faces are what make "you vs your friends" legible at a glance.

### X is a BADGE + share rail, NOT login

This is a hard, cost-driven decision. **In 2026 the X API has no free tier** — even *reading* a profile requires a funded prepaid balance, and `POST /2/tweets` costs **$0.20 per post when it contains a link** (and our cards *are* links). So:

- **We never call `POST /2/tweets`.** Sharing is always client-side `x.com/intent/post` links. **$0, forever.**
- **"Connect X"** does exactly *one* cached read at connect time, stored in `linked_accounts`. It powers a **verified badge** + a share rail. It is **not** an auth provider and is **removable without a migration**.

### Vanity URL / handle namespace

- Profiles: `tokenboard.sh/u/[handle]`. Communities: `tokenboard.sh/c/[slug]`.
- `handle` and `slug` share no namespace conflict (different path prefixes) but are each unique within their space.
- Anonymous CLI users get a system handle (`anon-7f3a`); **claiming** via GitHub OAuth lets them pick a real vanity handle and migrates all accumulated history onto it.

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

1. **Cost is computed server-side, always.** Clients upload *raw token counts*, never dollar figures. The pinned LiteLLM table (§5.3) is the single pricing authority. You cannot inflate your spend by lying about price — only the server prices.
2. **Trust tiers / pills on every row:**
   - **`verified`** — claimed account + GitHub OAuth (and optionally X badge). High trust.
   - **`cli`** — appeared via `npx tokenboard`, unclaimed/anonymous. Counts, but visibly lower trust.
   The pill is always visible on the board, so viewers calibrate.
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

Build the thinnest end-to-end vertical slice that proves the **product**, not parser breadth.

**Week 1 — the load-bearing slice:**

- [ ] **Day 1–3 — Claude Code parser (the hero, all ours).** Read `~/.claude/projects/**/*.jsonl`. Keep only `type=="assistant"` lines. **Global `message.id` dedup** (handle null `requestId`). Exclude `<synthetic>` model lines; decide the rule on `isApiErrorMessage`. Emit all **4 token buckets** including the `cache_creation` *object* (1h/5m split), not just the scalar.
- [ ] **Day 3–4 — Cost engine.** Vendor LiteLLM `model_prices` JSON + commit an offline snapshot. Price all 4 buckets correctly. Unknown model id → **log it, don't silently read 0.** Observed model mix: `claude-opus-4-8` (dominant), `claude-sonnet-4-6`, `<synthetic>` (exclude).
- [ ] **Day 4 — ONE ccusage adapter, ONE tool wired.** Pick Codex or one tail tool. Shell out `ccusage <tool> --json --offline`, map output into the normalized record, run it through *our* cost engine. **Proves the seam end-to-end** — one is enough.
- [ ] **Day 5 — The board.** Aggregate normalized records → public leaderboard view → the X-shareable screenshot. **This is where week-1 energy should visibly land** — it's the differentiation.
- [ ] **`tokenboard show-data` dry-run** — wire alongside the parser; it's the trust unlock and ships before any upload path.

**Week-1 Definition of Done:** my real Claude Code usage shows up on the board with a cost number that **matches my Anthropic console**, *and* one tool routed through ccusage shows up alongside it via the **same** cost engine. That single screenshot proves the whole architecture and is itself the launch asset.

**Explicitly NOT in week 1 (skip):**
- ❌ Gemini (no data exists).
- ❌ All 14 tail tools (one is enough to prove the seam).
- ❌ Forking ccusage.
- ❌ Hand-maintained pricing.
- ❌ Efficiency/intensity toggle (raw tokens/$ is the v1 headline; "for fun" — gamifies-waste is *not* a v1 concern).
- ❌ X as auth (badge + share rail only).

> Ship the board. Own the Claude Code counter. Lease the rest. That's the legit stack — and it's the one that won't get ratioed by someone whose bill doesn't match the number.

---

## 13. Open Questions

1. **`isApiErrorMessage` rule.** Do error-message assistant lines carry real billed tokens (Anthropic sometimes bills partial generations) or should they be excluded? Decision affects whether our number matches the console on error-heavy days — needs a console reconciliation test.
2. **Community visibility defaults & abuse.** Public rooms are discoverable and SEO-valuable but invite spam/squatting on good slugs; unlisted rooms are safer but spread worse. What's the right default, and do we need slug reservation / reporting before public launch?
3. **Anonymous (`cli` tier) retention on the global board.** Unclaimed CLI appearances drive the "appear first" hook, but how long do we keep an unclaimed anon handle's data before pruning, and how do we prevent the global board from filling with stale anon rows that never claimed?
