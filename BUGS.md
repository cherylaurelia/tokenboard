# tokenboard — bug tracker

Working list of known issues. Keep entries short; link PRs as they land.

Status key: 🔴 open · 🟡 investigating · 🟢 fix pushed (needs verify) · ✅ verified fixed

---

## Onboarding / auth
- 🔴 **Web sign-in flow feels off** — buttons need manual clicking to confirm they
  fire; the sign-in flow is confusing/weird. Needs a full end-to-end click-through.
- 🟢 **CLI GitHub sign-in opened an unstyled page** — believed fixed; verify on prod
  (open the approve link from a real CLI login and confirm it has styling).
- 🟡 **CLI claim → not on global leaderboard** *(high priority — core funnel)* — ROOT
  CAUSE FOUND. Not a leaderboard bug. `/global` reads a Redis ZSET that only gets a score
  from a successful `sync`; the write path works (verified: angelafeliciaa is on it). The
  real issue: `claim` (cli/src/commands/claim.ts:48) ends at "Claimed as @x" and never
  syncs or nudges — so users stop after claiming. Prod confirms: cherylaurelia claimed
  (1 device) but 0 usage rows; aliantod 0 devices/0 usage. Fix: auto-sync after a
  successful claim, then show rank/board link (fall back to a nudge if nothing to upload).

## Navigation
- 🔴 **Navbar discrepancy: lander vs app** — the landing nav and the leaderboard nav
  (`SiteNav`) use different labels/links. Reconcile into one consistent nav.

## Profile (edit)
- 🟡 **Edit profile doesn't work** — adding a social link (e.g. LinkedIn) fails to save.
  Two sub-issues found while investigating:
  - form layout is chopped/squeezed (it mounts *inside* the flex header `.head`)
  - "One of your links isn't valid" error even on valid input (the pure normalizer
    passes normal handles/URLs in unit tests — likely a UI value or a specific input
    shape; reproduce live to confirm the exact trigger)
  - 🟢 FIXED (validation): `stripHandle` rejected country/mobile subdomains — `ca.linkedin.com`
    (Canadian LinkedIn, the likely repro), `uk.linkedin.com`, `mobile.twitter.com`. Regex now
    allows any subdomain chain before the hardcoded host; spoofed hosts still rejected (tested).
  - PROD CHECK still standing: all users have `social_links = {}` (incl. owner) — so there may
    ALSO be a round-trip failure (auth on POST /api/v1/profile, the write, or router.refresh not
    reflecting). Need a live authed browser session to capture the actual response. The validation
    fix unblocks valid input; confirm saves actually persist once the browser is free.
- 🔴 **YouTube URL forms parse wrong** (separate from the LinkedIn bug) — `youtube.com/channel/UC123`
  stores handle as literally `"channel"`, `/c/Name` stores `"c"`. stripHandle keeps the first path
  segment, which is wrong for YouTube's `/channel/`, `/c/`, `/user/` forms (only `/@handle` is right).
  Needs YouTube-specific path handling. Low priority (YouTube rarely used), logged so it's not lost.

## Communities / schema
- 🟡 **`ubcbiztech` shows "member #N" (anonymized)** — it's a student club, shouldn't be
  anonymized. Root cause: `type === "company"` drives blanket aliasing. Real fix is the
  schema change below (anonymization should be its own opt-in flag, not derived from type).
- 💡 **Schema: collapse `community` vs `company` `type`** — `type` only exists to switch
  anonymization on. Recommend: drop `type`, keep `join_policy` (open/code/email_domain) as
  the only axis, and add an explicit `anonymize_members` setting the creator chooses.
  Note: `community_email_domains.domain` is globally unique (one community per domain);
  decide whether to block generic domains (gmail.com etc.).

## Performance
- 🟡 **CLI bare preview takes ~8s** — measured breakdown (364MB / 1,673 Claude JSONL files,
  this machine): `collectClaudeCodeLines` (read+parse) **~3.2s**, `collectCcusage` probe
  **~2.0s**, dedup ~5ms, rest = node startup. Findings:
  - **ccusage reads the same local JSONL we already read** — no special data source. For a
    Claude-only machine the probe is pure overhead.
  - Investigated a dir-existence pre-check to skip the probe: REJECTED. ccusage@20 is a Rust
    binary (paths not extractable), so we'd hardcode/guess source dirs → fragile, can silently
    under-count. Also wouldn't help here: `~/.codex` + `~/.gemini` exist but yielded 0 records,
    so the dir-check wouldn't skip the (wasted) 2s probe anyway.
  - Investigated a `raw.includes('"usage"')` pre-filter before JSON.parse: only ~250ms saved
    (46% of lines contain "usage"; transcripts are usage-heavy). Not worth it.
  - **Real bottleneck = raw I/O re-reading 364MB every run** (scan-only floor ~919ms; grows with
    history). Fix = INCREMENTAL CACHE (track file mtime/size, re-read only changed files).
  - 🟢 DONE: incremental parse cache (`claude-code-cache.ts`), keyed by (path, mtimeMs, size),
    storing the filtered ParsedLine[] per file. Dedup unchanged (runs over the full reassembled
    set), verified cold==warm output byte-identical. Claude read 3218ms → **87ms warm (37x)**.
    Also parallelized the ccusage probe with the Claude read (total now max(), not sum()).
  - FOLLOW-UPS still open: (1) the ccusage npx probe (~2s) is now the long pole — skip/optimize
    next; (2) cache file ~21MB (stores full `usage` obj/line) — could shrink to mapped numbers.

## QA tooling
- 🔴 **End-to-end onboarding browser agent** — want an automated browser pass that walks
  the whole onboarding for all test cases (web sign-in, CLI GitHub approve link, claim,
  edit profile, community join) and reports what's broken.
