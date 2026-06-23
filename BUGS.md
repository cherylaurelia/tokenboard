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

## Communities / schema
- 🟡 **`ubcbiztech` shows "member #N" (anonymized)** — it's a student club, shouldn't be
  anonymized. Root cause: `type === "company"` drives blanket aliasing. Real fix is the
  schema change below (anonymization should be its own opt-in flag, not derived from type).
- 💡 **Schema: collapse `community` vs `company` `type`** — `type` only exists to switch
  anonymization on. Recommend: drop `type`, keep `join_policy` (open/code/email_domain) as
  the only axis, and add an explicit `anonymize_members` setting the creator chooses.
  Note: `community_email_domains.domain` is globally unique (one community per domain);
  decide whether to block generic domains (gmail.com etc.).

## QA tooling
- 🔴 **End-to-end onboarding browser agent** — want an automated browser pass that walks
  the whole onboarding for all test cases (web sign-in, CLI GitHub approve link, claim,
  edit profile, community join) and reports what's broken.
